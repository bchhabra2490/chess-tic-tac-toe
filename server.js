const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files
app.use(express.static(path.join(__dirname)));

// Game rooms: roomId -> { players: [socketId1, socketId2], gameState: {...} }
const rooms = new Map();

// Player info: socketId -> { roomId, playerId: 'X'|'O' }
const players = new Map();

const BOARD_SIZE = 4;
const BOARD_CELLS = BOARD_SIZE * BOARD_SIZE;
const PIECE_TYPES = ["P", "R", "N", "B"];

function createInitialGameState() {
  return {
    board: Array(BOARD_CELLS).fill(null),
    pools: {
      X: PIECE_TYPES.slice(),
      O: PIECE_TYPES.slice()
    },
    currentPlayer: "X",
    gameOver: false,
    winner: null
  };
}

function checkWinner(b) {
  const lines = [
    [0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15],
    [0, 4, 8, 12], [1, 5, 9, 13], [2, 6, 10, 14], [3, 7, 11, 15],
    [0, 5, 10, 15], [3, 6, 9, 12]
  ];

  for (const [a, b0, c, d] of lines) {
    const first = b[a];
    if (!first) continue;
    if (
      b[b0] && b[c] && b[d] &&
      b[b0].player === first.player &&
      b[c].player === first.player &&
      b[d].player === first.player
    ) {
      return first.player;
    }
  }
  return null;
}

function isBoardFull(b) {
  return b.every(cell => cell !== null);
}

function countPiecesOnBoard(b, player) {
  return b.reduce((acc, cell) => acc + (cell && cell.player === player ? 1 : 0), 0);
}

function bothPlayersHaveThree(b) {
  return countPiecesOnBoard(b, "X") >= 3 && countPiecesOnBoard(b, "O") >= 3;
}

function indexToRowCol(index) {
  const row = Math.floor(index / BOARD_SIZE);
  const col = index % BOARD_SIZE;
  return { row, col };
}

function rowColToIndex(row, col) {
  return row * BOARD_SIZE + col;
}

function isLegalRookMove(b, fr, fc, tr, tc) {
  if (fr !== tr && fc !== tc) return false;
  const stepRow = fr === tr ? 0 : tr > fr ? 1 : -1;
  const stepCol = fc === tc ? 0 : tc > fc ? 1 : -1;
  let r = fr + stepRow;
  let c = fc + stepCol;
  while (r !== tr || c !== tc) {
    if (b[rowColToIndex(r, c)] !== null) return false;
    r += stepRow;
    c += stepCol;
  }
  return true;
}

function isLegalBishopMove(b, fr, fc, tr, tc) {
  const dr = tr - fr;
  const dc = tc - fc;
  if (Math.abs(dr) !== Math.abs(dc) || dr === 0) return false;
  const stepRow = dr > 0 ? 1 : -1;
  const stepCol = dc > 0 ? 1 : -1;
  let r = fr + stepRow;
  let c = fc + stepCol;
  while (r !== tr || c !== tc) {
    if (b[rowColToIndex(r, c)] !== null) return false;
    r += stepRow;
    c += stepCol;
  }
  return true;
}

function isLegalPawnMove(b, fr, fc, tr, tc, piece) {
  if (typeof piece.dir !== "number") return false;
  const dir = piece.dir;
  const forwardRow = fr - dir;
  
  console.log('fr', fr);
  console.log('fc', fc);
  console.log('tr', tr);
  console.log('tc', tc);
  console.log('dir', dir);
  console.log('forwardRow', forwardRow);

  if (tc === fc && tr === forwardRow) {
    if (b[rowColToIndex(tr, tc)] === null) return true;
  }
  if (tr === forwardRow && Math.abs(tc - fc) === 1) {
    const target = b[rowColToIndex(tr, tc)];
    if (target && target.player !== piece.player) return true;
  }
  return false;
}

function isLegalMove(b, fromIndex, toIndex, piece) {
  const { row: fr, col: fc } = indexToRowCol(fromIndex);
  const { row: tr, col: tc } = indexToRowCol(toIndex);
  const dr = tr - fr;
  const dc = tc - fc;
  
  switch (piece.type) {
    case "R":
      return isLegalRookMove(b, fr, fc, tr, tc);
    case "B":
      return isLegalBishopMove(b, fr, fc, tr, tc);
    case "N":
      return (Math.abs(dr) === 1 && Math.abs(dc) === 2) ||
        (Math.abs(dr) === 2 && Math.abs(dc) === 1);
    case "P":
      return isLegalPawnMove(b, fr, fc, tr, tc, piece);
    default:
      return false;
  }
}

function findAvailableRoom() {
  for (const [roomId, room] of rooms.entries()) {
    if (room.players.length === 1) {
      return roomId;
    }
  }
  return null;
}

io.on("connection", (socket) => {
  console.log(`Player connected: ${socket.id}`);
  // Broadcast current online player count
  io.emit("onlineCount", players.size + 1); // +1 for this connecting socket (not yet in map)

  socket.on("findOrCreateRoom", () => {
    // Try to find an available room first
    const availableRoomId = findAvailableRoom();
    
    if (availableRoomId) {
      // Join existing room
      const room = rooms.get(availableRoomId);
      if (room.players.length < 2 && !room.players.includes(socket.id)) {
        // Reset game state when a new player joins
        room.gameState = createInitialGameState();
        room.players.push(socket.id);
        players.set(socket.id, { roomId: availableRoomId, playerId: "O" });
        socket.join(availableRoomId);

        const roomData = {
          roomId: availableRoomId,
          gameState: room.gameState,
          players: room.players.map(id => ({ id, playerId: players.get(id)?.playerId })),
          isFull: true,
          playersCount: 2
        };
        
        // Notify both players that the room is now full
        io.to(availableRoomId).emit("roomJoined", roomData);

        console.log(`Player ${socket.id} auto-joined room ${availableRoomId}`);
        return;
      }
    }
    
    // Create new room if no available room found
    const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newRoom = {
      players: [socket.id],
      gameState: createInitialGameState()
    };
    rooms.set(roomId, newRoom);
    players.set(socket.id, { roomId, playerId: "X" });
    socket.join(roomId);
    socket.emit("roomCreated", { 
      roomId, 
      playerId: "X",
      isFull: false,
      playersCount: 1
    });
    console.log(`Room auto-created: ${roomId} by ${socket.id}`);
  });

  socket.on("createRoom", () => {
    const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    rooms.set(roomId, {
      players: [socket.id],
      gameState: createInitialGameState()
    });
    players.set(socket.id, { roomId, playerId: "X" });
    socket.join(roomId);
    socket.emit("roomCreated", { 
      roomId, 
      playerId: "X",
      isFull: false,
      playersCount: 1
    });
    console.log(`Room created: ${roomId} by ${socket.id}`);
  });

  socket.on("joinRoom", (data) => {
    const { roomId } = data;
    const room = rooms.get(roomId);

    if (!room) {
      socket.emit("error", { message: "Room not found" });
      return;
    }

    if (room.players.length >= 2) {
      console.log(`Room ${roomId} is full: ${room.players}`);
      socket.emit("error", { message: "Room is full" });
      return;
    }

    if (room.players.includes(socket.id)) {
      // socket.emit("error", { message: "You are already in this room" });
      return;
    }

    room.players.push(socket.id);
    players.set(socket.id, { roomId, playerId: "O" });
    socket.join(roomId);

    const roomData = {
      roomId,
      gameState: room.gameState,
      players: room.players.map(id => ({ id, playerId: players.get(id)?.playerId })),
      isFull: true,
      playersCount: 2
    };

    io.to(roomId).emit("roomJoined", roomData);

    console.log(`Player ${socket.id} joined room ${roomId}`);
  });

  socket.on("makeMove", (data) => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) {
      socket.emit("error", { message: "Not in a room" });
      return;
    }

    const room = rooms.get(playerInfo.roomId);
    if (!room) {
      socket.emit("error", { message: "Room not found" });
      return;
    }

    const { action, index, type, fromIndex, toIndex } = data;
    const gameState = room.gameState;

    if (gameState.gameOver) {
      socket.emit("error", { message: "Game is over" });
      return;
    }

    if (gameState.currentPlayer !== playerInfo.playerId) {
      socket.emit("error", { message: "Not your turn" });
      return;
    }

    // Validate and apply move
    if (action === "place") {
      if (gameState.board[index] !== null) {
        socket.emit("error", { message: "Cell is not empty" });
        return;
      }
      const pool = gameState.pools[playerInfo.playerId];
      const idx = pool.indexOf(type);
      if (idx === -1) {
        socket.emit("error", { message: "Piece not available" });
        return;
      }

      const piece = { player: playerInfo.playerId, type };
      if (type === "P") {
        piece.dir = playerInfo.playerId === "X" ? -1 : 1;
        if(([12, 13, 14, 15].includes(index) && playerInfo.playerId === "X") || ([0, 1, 2, 3].includes(index) && playerInfo.playerId === "O")){
          piece.dir = -1 * piece.dir;
          console.log('piece.dir', piece.dir);
        }
      }
      gameState.board[index] = piece;
      pool.splice(idx, 1);
    } else if (action === "move") {
      if (!bothPlayersHaveThree(gameState.board)) {
        socket.emit("error", { message: "Cannot move yet" });
        return;
      }
      const fromCell = gameState.board[fromIndex];
      if (!fromCell || fromCell.player !== playerInfo.playerId) {
        socket.emit("error", { message: "Invalid move" });
        return;
      }
      const toCell = gameState.board[toIndex];
      if (toCell && toCell.player === playerInfo.playerId) {
        socket.emit("error", { message: "Cannot capture own piece" });
        return;
      }

      if (!isLegalMove(gameState.board, fromIndex, toIndex, fromCell)) {
        socket.emit("error", { message: "Illegal move" });
        return;
      }

      if (toCell && toCell.player !== playerInfo.playerId) {
        gameState.pools[toCell.player].push(toCell.type);
      }

      gameState.board[toIndex] = { ...fromCell };
      gameState.board[fromIndex] = null;

      if (fromCell.type === "P" && typeof fromCell.dir === "number") {
        const { row } = indexToRowCol(toIndex);
        if (row === 0 || row === BOARD_SIZE - 1) {
          gameState.board[toIndex].dir = -fromCell.dir;
        }
      }
    }

    // Check for winner
    const winner = checkWinner(gameState.board);
    if (winner) {
      gameState.gameOver = true;
      gameState.winner = winner;
    } else if (isBoardFull(gameState.board)) {
      gameState.gameOver = true;
    } else {
      gameState.currentPlayer = gameState.currentPlayer === "X" ? "O" : "X";
    }

    // Broadcast updated state
    io.to(playerInfo.roomId).emit("gameStateUpdate", gameState);
  });

  socket.on("disconnect", () => {
    const playerInfo = players.get(socket.id);
    if (playerInfo) {
      const room = rooms.get(playerInfo.roomId);
      if (room) {
        const wasFull = room.players.length === 2;
        room.players = room.players.filter(id => id !== socket.id);
        
        if (room.players.length === 0) {
          // Room is empty, delete it
          rooms.delete(playerInfo.roomId);
        } else if (wasFull) {
          // Room was full, remaining player wins
          const remainingPlayerId = room.players[0];
          const remainingPlayerInfo = players.get(remainingPlayerId);
          
          if (remainingPlayerInfo && !room.gameState.gameOver) {
            // Mark the remaining player as winner
            room.gameState.gameOver = true;
            room.gameState.winner = remainingPlayerInfo.playerId;
            
            // Notify the remaining player about the disconnect and victory
            io.to(remainingPlayerId).emit("playerDisconnected", {
              playerId: playerInfo.playerId,
              reason: "opponent_disconnected"
            });
            io.to(remainingPlayerId).emit("gameStateUpdate", room.gameState);
            console.log(`Player ${remainingPlayerId} wins by disconnect (opponent ${socket.id} left)`);
          }
        } else {
          // Room had only 1 player, just notify
          io.to(playerInfo.roomId).emit("playerDisconnected", {
            playerId: playerInfo.playerId,
            reason: "waiting"
          });
        }
      }
      players.delete(socket.id);
    }
    console.log(`Player disconnected: ${socket.id}`);
    // Broadcast updated online player count
    io.emit("onlineCount", players.size);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
