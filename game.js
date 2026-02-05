// Two‑player Chess Tic‑Tac‑Toe, 4×4
// Pieces per side: Pawn, Rook, Knight, Bishop.
// First 3 turns per player: must place pieces.
// Once both players have 3 pieces on the board, a turn may be
// either placing a remaining piece or moving one of your pieces
// with its normal chess move (on a 4×4 board).
// Pawns do not promote; when they reach the far rank, on future
// moves they walk in the opposite direction.

const PLAYER_X = "X"; // left side
const PLAYER_O = "O"; // right side

const BOARD_SIZE = 4;
const BOARD_CELLS = BOARD_SIZE * BOARD_SIZE;

// Piece types used in this variant
const PIECE_TYPES = ["P", "R", "N", "B"]; // pawn, rook, knight, bishop

// Game state
let board; // length 16, cells: null or { player, type, dir? }
let pools; // remaining pieces not yet on the board
let currentPlayer;
let gameOver;

// Track last move for visual highlight
let lastMoveIndex = null; // board index (0–15) of the last move destination

// Move history (for replay with left/right arrow keys)
let moveHistory = []; // array of snapshots { board, pools, currentPlayer, gameOver }
let moveIndex = -1; // index into moveHistory; -1 = no moves yet

// Modes: "human" (2 players), "ai" (human vs AI as Black), or "online"
let gameMode = "online";
let isAiThinking = false;

// Socket.IO connection for online mode
let socket = null;
let onlinePlayerId = null; // "X" or "O" assigned by server
let roomId = null;
let isRoomFull = false; // Track if room has 2 players
let onlineCount = 0; // How many players are online in total

// UI selection state
let selectedFromBoardIndex = null; // index of a selected piece to move
let selectedPoolPiece = null; // { player, type } chosen from side pool

/****************************************************
 * Helpers
 ****************************************************/

function indexToRowCol(index) {
  const row = Math.floor(index / BOARD_SIZE);
  const col = index % BOARD_SIZE;
  return { row, col };
}

function rowColToIndex(row, col) {
  return row * BOARD_SIZE + col;
}

function countPiecesOnBoard(player) {
  return board.reduce(
    (acc, cell) => acc + (cell && cell.player === player ? 1 : 0),
    0
  );
}

function bothPlayersHaveThree() {
  return (
    countPiecesOnBoard(PLAYER_X) >= 3 && countPiecesOnBoard(PLAYER_O) >= 3
  );
}

function canCurrentPlayerMovePieces() {
  return bothPlayersHaveThree();
}

/****************************************************
 * Win / draw checks
 ****************************************************/

function checkWinner(b) {
  const lines = [
    // rows
    [0, 1, 2, 3],
    [4, 5, 6, 7],
    [8, 9, 10, 11],
    [12, 13, 14, 15],
    // columns
    [0, 4, 8, 12],
    [1, 5, 9, 13],
    [2, 6, 10, 14],
    [3, 7, 11, 15],
    // diagonals
    [0, 5, 10, 15],
    [3, 6, 9, 12]
  ];

  for (let i = 0; i < lines.length; i++) {
    const [a, b0, c, d] = lines[i];
    const first = b[a];
    if (!first) continue;

    if (
      b[b0] &&
      b[c] &&
      b[d] &&
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

/****************************************************
 * Rendering
 ****************************************************/

function getPieceSvgPath(player, type) {
  const baseNameMap = {
    P: "pawn",
    R: "rook",
    N: "knight",
    B: "bishop"
  };

  const base = baseNameMap[type];
  if (!base) return null;

  const colorSuffix = player === PLAYER_X ? "w" : "b";
  return "pieces-basic-svg/" + base + "-" + colorSuffix + ".svg";
}

function getDisplayIndex(boardIndex) {
  // Determine if board should be flipped (when user is Black/O)
  let shouldFlip = false;
  if (gameMode === "online" && onlinePlayerId === PLAYER_O) {
    shouldFlip = true;
  }
  
  if (shouldFlip) {
    // Flip the board: map 0->15, 1->14, 2->13, etc.
    return BOARD_CELLS - 1 - boardIndex;
  }
  return boardIndex;
}

function getBoardIndex(displayIndex) {
  // Reverse mapping: convert display index back to board index
  let shouldFlip = false;
  if (gameMode === "online" && onlinePlayerId === PLAYER_O) {
    shouldFlip = true;
  }
  
  if (shouldFlip) {
    return BOARD_CELLS - 1 - displayIndex;
  }
  return displayIndex;
}

function renderBoard() {
  for (let displayIdx = 0; displayIdx < BOARD_CELLS; displayIdx++) {
    const cellEl = document.getElementById("cell-" + displayIdx);
    if (!cellEl) continue;

    // Ensure cell is positioned for overlays (pawn direction arrows)
    if (!cellEl.style.position) {
      cellEl.style.position = "relative";
    }

    const boardIdx = getBoardIndex(displayIdx);
    const contentEl = cellEl.querySelector(".cell-content") || cellEl;
    const cell = board[boardIdx];

    cellEl.classList.remove("cell-x", "cell-o", "cell-selected", "cell-last-move");

    // Remove any existing pawn direction arrow
    const existingArrow = cellEl.querySelector(".pawn-direction-arrow");
    if (existingArrow) {
      existingArrow.remove();
    }

    if (cell) {
      const svgPath = getPieceSvgPath(cell.player, cell.type);

      if (svgPath) {
        contentEl.innerHTML =
          '<img src="' +
          svgPath +
          '" alt="' +
          cell.player +
          cell.type +
          ' piece" />';
      } else {
        contentEl.textContent = cell.player + cell.type;
      }

      if (cell.player === PLAYER_X) {
        cellEl.classList.add("cell-x");
      } else if (cell.player === PLAYER_O) {
        cellEl.classList.add("cell-o");
      }

      // Highlight the square of the last move (destination)
      if (lastMoveIndex !== null && boardIdx === lastMoveIndex) {
        cellEl.classList.add("cell-last-move");
      }

      // If this is a pawn with a direction, overlay an arrow icon
      if (cell.type === "P" && typeof cell.dir === "number") {
        const arrowEl = document.createElement("div");
        arrowEl.className = "pawn-direction-arrow";
        // Determine if board is flipped (opponent's perspective in online mode)
        const isFlipped = gameMode === "online" && onlinePlayerId === PLAYER_O;
        // For user: dir > 0 = ↑, dir < 0 = ↓
        // For opponent (flipped): dir > 0 = ↓, dir < 0 = ↑
        const displayDir = isFlipped ? -cell.dir : cell.dir;
        arrowEl.textContent = displayDir > 0 ? "↑" : "↓";
        arrowEl.style.position = "absolute";
        arrowEl.style.right = "2px";
        arrowEl.style.bottom = "2px";
        arrowEl.style.fontSize = "12px";
        arrowEl.style.fontWeight = "bold";
        arrowEl.style.color = "#f97316"; // accent orange
        arrowEl.style.textShadow = "0 0 2px rgba(0,0,0,0.6)";
        arrowEl.style.pointerEvents = "none";
        cellEl.appendChild(arrowEl);
      }
    } else {
      contentEl.textContent = "";
    }
  }

  if (selectedFromBoardIndex !== null) {
    const displayIdx = getDisplayIndex(selectedFromBoardIndex);
    const selEl = document.getElementById("cell-" + displayIdx);
    if (selEl) {
      selEl.classList.add("cell-selected");
    }
  }

  updateStatus();
}

function renderPiecePools() {
  const bottomContainer = document.getElementById("human-pieces");
  const topContainer = document.getElementById("ai-pieces");

  // Determine which player the user controls
  let userPlayer = PLAYER_X; // Default: user is White (X)
  if (gameMode === "online" && onlinePlayerId) {
    userPlayer = onlinePlayerId;
  }
  // In AI mode, user is always X
  // In local 2-player mode, user can be either, but we'll default to X on bottom

  const opponentPlayer = userPlayer === PLAYER_X ? PLAYER_O : PLAYER_X;

  // Top container shows opponent's pieces
  if (topContainer) {
    topContainer.innerHTML = "";
    pools[opponentPlayer].forEach(type => {
      const el = createPieceElement(opponentPlayer, type);
      topContainer.appendChild(el);
    });
  }

  // Bottom container shows user's pieces
  if (bottomContainer) {
    bottomContainer.innerHTML = "";
    pools[userPlayer].forEach(type => {
      const el = createPieceElement(userPlayer, type);
      bottomContainer.appendChild(el);
    });
  }
}

function createPieceElement(player, type) {
  const container = document.createElement("div");
  container.className = "piece-slot";
  container.dataset.player = player;
  container.dataset.piece = type;

  const img = document.createElement("img");
  const svgPath = getPieceSvgPath(player, type);
  if (svgPath) {
    img.src = svgPath;
    img.alt = player + type + " piece";
  } else {
    img.alt = player + type;
  }

  container.appendChild(img);

  // Drag placement support
  container.draggable = true;
  container.addEventListener("dragstart", onPoolPieceDragStart);

  // Click‑to‑select placement support (no drag)
  container.addEventListener("click", function () {
    if (gameOver) return;
    if (player !== currentPlayer) return;
    // In online mode, don't allow piece selection if room is not full yet
    if (gameMode === "online" && !isRoomFull) return;
    // In AI mode, only allow White (human) to select from the pool
    if (gameMode === "ai" && currentPlayer === PLAYER_O) return;
    // In online mode, only allow your own pieces
    if (gameMode === "online" && player !== onlinePlayerId) return;
    selectedPoolPiece = { player, type };
    selectedFromBoardIndex = null;
    updateStatus();
  });

  return container;
}

function updateStatus() {
  const statusEl = document.getElementById("status");
  if (!statusEl) return;

  if (gameOver) {
    statusEl.textContent = "Game over";
    return;
  }

  const canMove = canCurrentPlayerMovePieces();
  const poolCount = pools[currentPlayer].length;
  const movePart = canMove
    ? poolCount > 0
      ? "Place a piece or move one of your pieces."
      : "Move one of your pieces."
    : "Place a piece.";

  const colorName = currentPlayer === PLAYER_X ? "White" : "Black";
  let modeLabel = "";
  if (gameMode === "ai") {
    modeLabel = " (vs AI)";
  } else if (gameMode === "online") {
    if (!isRoomFull) {
      modeLabel = " (Waiting for opponent...)";
    } else if (onlinePlayerId && currentPlayer === onlinePlayerId) {
      modeLabel = " (Your turn)";
    } else if (onlinePlayerId) {
      modeLabel = " (Opponent's turn)";
    } else {
      modeLabel = " (Online - connecting...)";
    }
  }
  const onlineInfo =
    gameMode === "online" && onlineCount > 0
      ? ` [${onlineCount} online]`
      : "";

  statusEl.textContent =
    colorName + " to play" + modeLabel + onlineInfo + ". " + movePart;

  // If we're viewing an old position in the move history, annotate status
  if (moveHistory.length > 0 && moveIndex >= 0 && moveIndex !== moveHistory.length - 1) {
    statusEl.textContent += ` (Viewing move ${moveIndex + 1}/${moveHistory.length})`;
  }

  // Highlight board based on whose turn it is
  const wrapper = document.querySelector(".game-wrapper");
  if (wrapper) {
    wrapper.classList.toggle("turn-x", currentPlayer === PLAYER_X);
    wrapper.classList.toggle("turn-o", currentPlayer === PLAYER_O);
  }
}

function endGame(message) {
  const statusEl = document.getElementById("status");
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.classList.add("status-strong");
  }
  gameOver = true;
  showConfetti();
}

/****************************************************
 * Simple confetti effect
 ****************************************************/

function showConfetti() {
  const container = document.body;
  if (!container) return;

  const colors = ["#f97316", "#22c55e", "#38bdf8", "#eab308", "#a855f7"];
  const pieces = 80;

  for (let i = 0; i < pieces; i++) {
    const conf = document.createElement("div");
    conf.style.position = "fixed";
    conf.style.top = "-10px";
    conf.style.left = Math.random() * 100 + "vw";
    conf.style.width = "6px";
    conf.style.height = "12px";
    conf.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    conf.style.opacity = "0.9";
    conf.style.borderRadius = "2px";
    conf.style.pointerEvents = "none";
    conf.style.zIndex = "9999";

    const fallDuration = 3 + Math.random() * 2; // 3–5s
    const horizontalDrift = (Math.random() - 0.5) * 40; // px
    const rotate = (Math.random() - 0.5) * 720; // deg

    conf.style.transition =
      "transform " + fallDuration + "s linear, opacity " + fallDuration + "s linear";

    container.appendChild(conf);

    // Trigger layout
    void conf.offsetWidth;

    const translateY = window.innerHeight + 40;
    conf.style.transform =
      "translate(" + horizontalDrift + "px, " + translateY + "px) rotate(" + rotate + "deg)";
    conf.style.opacity = "0";

    setTimeout(() => {
      if (conf.parentNode) {
        conf.parentNode.removeChild(conf);
      }
    }, fallDuration * 1000);
  }
}

/****************************************************
 * Placement: drag & drop
 ****************************************************/

function onPoolPieceDragStart(event) {
  const slot = event.target.closest(".piece-slot");
  if (!slot) return;

  // Don't allow editing while viewing historical position
  if (moveHistory.length > 0 && moveIndex !== moveHistory.length - 1) return;

  const player = slot.dataset.player;
  const type = slot.dataset.piece;
  if (!player || !type) return;
  if (player !== currentPlayer || gameOver) return;
  // In online mode, don't allow piece selection if room is not full yet
  if (gameMode === "online" && !isRoomFull) return;
  // In AI mode, human can only control White (PLAYER_X)
  if (gameMode === "ai" && currentPlayer === PLAYER_O) return;
  // In online mode, only allow your own pieces
  if (gameMode === "online" && player !== onlinePlayerId) return;

  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(
    "text/plain",
    JSON.stringify({ player, type })
  );

  selectedPoolPiece = { player, type };
  selectedFromBoardIndex = null;
}

function onCellDragOver(event) {
  if (gameOver) return;
  if (gameMode === "online" && !isRoomFull) return;
  if (gameMode === "ai" && currentPlayer === PLAYER_O) return;
  if (gameMode === "online" && currentPlayer !== onlinePlayerId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
}

function onCellDrop(event, index) {
  event.preventDefault();
  if (gameOver) return;
  // Don't allow editing while viewing historical position
  if (moveHistory.length > 0 && moveIndex !== moveHistory.length - 1) return;
  if (gameMode === "online" && !isRoomFull) return;
  if (gameMode === "ai" && currentPlayer === PLAYER_O) return;
  if (gameMode === "online" && currentPlayer !== onlinePlayerId) return;

  const raw = event.dataTransfer.getData("text/plain");
  if (!raw) return;

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return;
  }
  const { player, type } = data;

  if (player !== currentPlayer) return;
  if (board[index] !== null) return; // cannot place and capture

  placePiece(player, type, index);
}

/****************************************************
 * Placement / movement core
 ****************************************************/

function placePiece(player, type, index) {
  if (gameOver) return;
  // Don't allow editing while viewing historical position
  if (moveHistory.length > 0 && moveIndex !== moveHistory.length - 1) return;
  if (player !== currentPlayer) return;
  if (board[index] !== null) return;

  // In online mode, emit to server instead of applying locally
  if (gameMode === "online" && socket) {
    if (!isRoomFull) return; // Don't allow moves if waiting for opponent
    if (player !== onlinePlayerId) return;
    socket.emit("makeMove", { action: "place", index, type });
    return;
  }

  const pool = pools[player];
  const idx = pool.indexOf(type);
  if (idx === -1) return;

  const piece = { player, type };
  if (type === "P") {
    // Initial direction: X pawns go "down" (increasing row),
    // O pawns go "up" (decreasing row).
    piece.dir = player === PLAYER_X ? 1 : -1;
    if(([12, 13, 14, 15].includes(index) && player === PLAYER_O) || ([0, 1, 2, 3].includes(index) && player === PLAYER_X)){
      piece.dir = -1 * piece.dir;
      console.log('piece.dir', piece.dir);
    }
  }

  board[index] = piece;
  pool.splice(idx, 1);

  selectedPoolPiece = null;
  selectedFromBoardIndex = null;

  // Record last move destination for highlight
  lastMoveIndex = index;

  afterAction();
}

function tryMovePiece(fromIndex, toIndex) {
  if (gameOver) return false;
  // Don't allow editing while viewing historical position
  if (moveHistory.length > 0 && moveIndex !== moveHistory.length - 1) return false;
  if (!canCurrentPlayerMovePieces()) return false;

  const fromCell = board[fromIndex];
  if (!fromCell || fromCell.player !== currentPlayer) return false;
  if (fromIndex === toIndex) return false;

  const toCell = board[toIndex];
  if (toCell && toCell.player === currentPlayer) return false;

  if (!isLegalMove(fromIndex, toIndex, fromCell)) {
    return false;
  }

  // In online mode, emit to server instead of applying locally
  if (gameMode === "online" && socket) {
    if (!isRoomFull) return false; // Don't allow moves if waiting for opponent
    if (fromCell.player !== onlinePlayerId) return false;
    socket.emit("makeMove", { action: "move", fromIndex, toIndex });
    return true;
  }

  // If we are capturing an opponent piece, return it to that player's pool
  if (toCell && toCell.player !== currentPlayer) {
    if (pools && pools[toCell.player]) {
      pools[toCell.player].push(toCell.type);
    }
  }

  // Execute move (captures allowed here)
  board[toIndex] = { ...fromCell };
  board[fromIndex] = null;

  // Pawn direction reversal when it reaches any board edge.
  // Only reverse once: after the first reversal, it keeps that direction.
  if (fromCell.type === "P" && typeof fromCell.dir === "number") {
    const { row } = indexToRowCol(toIndex);
    const atRowEdge = row === 0 || row === BOARD_SIZE - 1;
  
    if (atRowEdge) {
      board[toIndex].dir = -1 * fromCell.dir;
    }
  }

  selectedFromBoardIndex = null;
  selectedPoolPiece = null;

  // Record last move destination for highlight
  lastMoveIndex = toIndex;

  afterAction();
  return true;
}

function isLegalMove(fromIndex, toIndex, piece) {
  const { row: fr, col: fc } = indexToRowCol(fromIndex);
  const { row: tr, col: tc } = indexToRowCol(toIndex);

  const dr = tr - fr;
  const dc = tc - fc;

  switch (piece.type) {
    case "R":
      return isLegalRookMove(fr, fc, tr, tc);
    case "B":
      return isLegalBishopMove(fr, fc, tr, tc);
    case "N":
      return isLegalKnightMove(dr, dc);
    case "P":
      return isLegalPawnMove(fr, fc, tr, tc, piece);
    default:
      return false;
  }
}

function isLegalRookMove(fr, fc, tr, tc) {
  if (fr !== tr && fc !== tc) return false;

  const stepRow = fr === tr ? 0 : tr > fr ? 1 : -1;
  const stepCol = fc === tc ? 0 : tc > fc ? 1 : -1;

  let r = fr + stepRow;
  let c = fc + stepCol;

  while (r !== tr || c !== tc) {
    const idx = rowColToIndex(r, c);
    if (board[idx] !== null) return false;
    r += stepRow;
    c += stepCol;
  }

  return true;
}

function isLegalBishopMove(fr, fc, tr, tc) {
  const dr = tr - fr;
  const dc = tc - fc;

  if (Math.abs(dr) !== Math.abs(dc) || dr === 0) return false;

  const stepRow = dr > 0 ? 1 : -1;
  const stepCol = dc > 0 ? 1 : -1;

  let r = fr + stepRow;
  let c = fc + stepCol;

  while (r !== tr || c !== tc) {
    const idx = rowColToIndex(r, c);
    if (board[idx] !== null) return false;
    r += stepRow;
    c += stepCol;
  }

  return true;
}

function isLegalKnightMove(dr, dc) {
  const adr = Math.abs(dr);
  const adc = Math.abs(dc);
  return (adr === 1 && adc === 2) || (adr === 2 && adc === 1);
}

function isLegalPawnMove(fr, fc, tr, tc, piece) {
  console.log('fr', fr);
  console.log('fc', fc);
  console.log('tr', tr);
  console.log('tc', tc);
  console.log('piece', piece);
  // Pawn always moves strictly according to its current direction.
  // If direction is missing, the move is not allowed.
  if (typeof piece.dir !== "number") return false;
  const dir = piece.dir;
  const forwardRow = fr - dir;

  // Forward move (no capture)
  if (tc === fc && tr === forwardRow) {
    const idx = rowColToIndex(tr, tc);
    if (board[idx] === null) return true;
  }

  // Diagonal capture
  if (tr === forwardRow && Math.abs(tc - fc) === 1) {
    const idx = rowColToIndex(tr, tc);
    const target = board[idx];
    if (target && target.player !== piece.player) return true;
  }

  return false;
}

/****************************************************
 * AI: minimax with alpha-beta pruning
 * AI plays as Black (O), human as White (X). Maximizing = O.
 ****************************************************/

function cloneBoard(b) {
  return b.map(cell =>
    cell ? { player: cell.player, type: cell.type, dir: cell.dir } : null
  );
}

function clonePools(p) {
  return { [PLAYER_X]: p[PLAYER_X].slice(), [PLAYER_O]: p[PLAYER_O].slice() };
}

function countPiecesOnBoardFor(b, player) {
  return b.reduce(
    (acc, cell) => acc + (cell && cell.player === player ? 1 : 0),
    0
  );
}

function bothPlayersHaveThreeFor(b) {
  return (
    countPiecesOnBoardFor(b, PLAYER_X) >= 3 &&
    countPiecesOnBoardFor(b, PLAYER_O) >= 3
  );
}

function canPlayerMovePiecesFor(b, p, player) {
  return bothPlayersHaveThreeFor(b);
}

function isLegalRookMoveOnBoard(b, fr, fc, tr, tc) {
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

function isLegalBishopMoveOnBoard(b, fr, fc, tr, tc) {
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

function isLegalPawnMoveOnBoard(b, fr, fc, tr, tc, piece) {
  if (typeof piece.dir !== "number") return false;
  const dir = piece.dir;
  const forwardRow = fr - dir;
  if (tc === fc && tr === forwardRow) {
    if (b[rowColToIndex(tr, tc)] === null) return true;
  }
  if (tr === forwardRow && Math.abs(tc - fc) === 1) {
    const target = b[rowColToIndex(tr, tc)];
    if (target && target.player !== piece.player) return true;
  }
  return false;
}

function isLegalMoveOnBoard(b, fromIndex, toIndex, piece) {
  const { row: fr, col: fc } = indexToRowCol(fromIndex);
  const { row: tr, col: tc } = indexToRowCol(toIndex);
  const dr = tr - fr;
  const dc = tc - fc;
  switch (piece.type) {
    case "R":
      return isLegalRookMoveOnBoard(b, fr, fc, tr, tc);
    case "B":
      return isLegalBishopMoveOnBoard(b, fr, fc, tr, tc);
    case "N":
      return (Math.abs(dr) === 1 && Math.abs(dc) === 2) ||
        (Math.abs(dr) === 2 && Math.abs(dc) === 1);
    case "P":
      return isLegalPawnMoveOnBoard(b, fr, fc, tr, tc, piece);
    default:
      return false;
  }
}

function getAllLegalPlacementsFor(b, p, player) {
  const results = [];
  const pool = p[player];
  if (!pool || pool.length === 0) return results;
  for (let i = 0; i < BOARD_CELLS; i++) {
    if (b[i] !== null) continue;
    for (let t = 0; t < pool.length; t++) {
      results.push({ kind: "place", index: i, type: pool[t] });
    }
  }
  return results;
}

function getAllLegalMovesFor(b, p, player) {
  const moves = [];
  for (let i = 0; i < BOARD_CELLS; i++) {
    const cell = b[i];
    if (!cell || cell.player !== player) continue;
    for (let j = 0; j < BOARD_CELLS; j++) {
      if (i === j) continue;
      const target = b[j];
      if (target && target.player === player) continue;
      if (isLegalMoveOnBoard(b, i, j, cell)) {
        moves.push({ kind: "move", from: i, to: j });
      }
    }
  }
  return moves;
}

function getAllActions(b, p, player) {
  const placements = getAllLegalPlacementsFor(b, p, player);
  const canMove = canPlayerMovePiecesFor(b, p, player);
  const moves = canMove ? getAllLegalMovesFor(b, p, player) : [];
  return [...placements, ...moves];
}

function applyPlacement(b, p, player, type, index) {
  const pool = p[player];
  const idx = pool.indexOf(type);
  if (idx === -1) return;
  const piece = { player, type };
  if (type === "P") {
    // Initial direction: X pawns go "down" (increasing row),
    // O pawns go "up" (decreasing row).
    piece.dir = player === PLAYER_X ? 1 : -1;
    // If pawn is placed on an edge square, reverse direction
    if(([12, 13, 14, 15].includes(index) && player === PLAYER_O) || ([0, 1, 2, 3].includes(index) && player === PLAYER_X)){
      piece.dir = -1 * piece.dir;
    }
  }
  b[index] = piece;
  pool.splice(idx, 1);
}

function applyMove(b, p, fromIndex, toIndex) {
  const fromCell = b[fromIndex];
  if (!fromCell) return;
  const toCell = b[toIndex];
  if (toCell && toCell.player !== fromCell.player) {
    p[toCell.player].push(toCell.type);
  }
  b[toIndex] = { ...fromCell };
  b[fromIndex] = null;
  if (fromCell.type === "P" && typeof fromCell.dir === "number") {
    const { row } = indexToRowCol(toIndex);
    if (row === 0 || row === BOARD_SIZE - 1) {
      b[toIndex].dir = -1 * fromCell.dir;
    }
  }
}

const MINIMAX_WIN = 100;
const MINIMAX_LOSS = -100;
const MINIMAX_DRAW = 0;
const MAX_DEPTH = 2;

function minimax(b, p, depth, isMaximizing, alpha, beta) {
  const winner = checkWinner(b);
  if (winner === PLAYER_O) return MINIMAX_WIN - depth;
  if (winner === PLAYER_X) return MINIMAX_LOSS + depth;
  if (isBoardFull(b)) return MINIMAX_DRAW;
  if (depth >= MAX_DEPTH) return MINIMAX_DRAW;

  const player = isMaximizing ? PLAYER_O : PLAYER_X;
  const actions = getAllActions(b, p, player);

  if (actions.length === 0) {
    return MINIMAX_DRAW;
  }

  if (isMaximizing) {
    let best = MINIMAX_LOSS;
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const b2 = cloneBoard(b);
      const p2 = clonePools(p);
      if (action.kind === "place") {
        applyPlacement(b2, p2, PLAYER_O, action.type, action.index);
      } else {
        applyMove(b2, p2, action.from, action.to);
      }
      const score = minimax(b2, p2, depth + 1, false, alpha, beta);
      best = Math.max(best, score);
      alpha = Math.max(alpha, score);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = MINIMAX_WIN;
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const b2 = cloneBoard(b);
      const p2 = clonePools(p);
      if (action.kind === "place") {
        applyPlacement(b2, p2, PLAYER_X, action.type, action.index);
      } else {
        applyMove(b2, p2, action.from, action.to);
      }
      const score = minimax(b2, p2, depth + 1, true, alpha, beta);
      best = Math.min(best, score);
      beta = Math.min(beta, score);
      if (beta <= alpha) break;
    }
    return best;
  }
}

function getBestAiAction() {
  const b = cloneBoard(board);
  const p = clonePools(pools);
  const actions = getAllActions(b, p, PLAYER_O);
  if (actions.length === 0) return null;

  let bestScore = MINIMAX_LOSS;
  let bestAction = null;

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const b2 = cloneBoard(board);
    const p2 = clonePools(pools);
    if (action.kind === "place") {
      applyPlacement(b2, p2, PLAYER_O, action.type, action.index);
    } else {
      applyMove(b2, p2, action.from, action.to);
    }
    const score = minimax(b2, p2, 0, false, MINIMAX_LOSS, MINIMAX_WIN);
    if (score > bestScore) {
      bestScore = score;
      bestAction = action;
    }
  }
  return bestAction;
}

function getAllLegalPlacements(player) {
  return getAllLegalPlacementsFor(board, pools, player).map(({ index, type }) => ({
    index,
    type
  }));
}

function getAllLegalMoves(player) {
  return getAllLegalMovesFor(board, pools, player).map(({ from, to }) => ({
    from,
    to
  }));
}

function maybeTriggerAiTurn() {
  if (gameMode !== "ai") return;
  if (currentPlayer !== PLAYER_O) return;
  if (gameOver) return;
  if (isAiThinking) return;

  isAiThinking = true;
  setTimeout(() => {
    try {
      aiTakeTurn();
    } finally {
      isAiThinking = false;
    }
  }, 400);
}

function aiTakeTurn() {
  if (gameOver) return;
  if (currentPlayer !== PLAYER_O) return;

  const action = getBestAiAction();
  if (!action) {
    currentPlayer = PLAYER_X;
    renderBoard();
    renderPiecePools();
    return;
  }

  if (action.kind === "place") {
    placePiece(PLAYER_O, action.type, action.index);
  } else {
    tryMovePiece(action.from, action.to);
  }
}

function afterAction() {
  // In online mode, server handles turn switching - don't do it locally
  if (gameMode === "online") {
    return;
  }
  
  const winner = checkWinner(board);
  if (winner) {
    endGame((winner === PLAYER_X ? "White" : "Black") + " wins!");
    renderBoard();
    renderPiecePools();
    recordHistorySnapshot();
    return;
  }

  if (isBoardFull(board)) {
    endGame("Draw!");
    renderBoard();
    renderPiecePools();
    recordHistorySnapshot();
    return;
  }
  currentPlayer = currentPlayer === PLAYER_X ? PLAYER_O : PLAYER_X;
  renderBoard();
  renderPiecePools();

  if (!gameOver) {
    maybeTriggerAiTurn();
  }

  // Record state after each completed move in local/AI modes.
  // Snapshot always reflects the side TO move (after turn switch).
  recordHistorySnapshot();
}

/****************************************************
 * Click handler for board cells
 ****************************************************/

function handleCellClick(displayIndex) {
  if (gameOver) return;
  // In online mode, don't allow moves if room is not full yet
  if (gameMode === "online" && !isRoomFull) return;
  // In AI mode, ignore clicks when it's the AI's turn (Black)
  if (gameMode === "ai" && currentPlayer === PLAYER_O) return;
  // In online mode, ignore clicks when it's not your turn
  if (gameMode === "online" && currentPlayer !== onlinePlayerId) return;

  // Convert display index to board index (accounts for board flipping)
  const index = getBoardIndex(displayIndex);
  const cell = board[index];

  // If we have a selected piece from the board, try to move it.
  if (selectedFromBoardIndex !== null) {
    const moved = tryMovePiece(selectedFromBoardIndex, index);
    if (!moved) {
      // If move failed and we clicked another of our own pieces,
      // switch selection; otherwise clear selection.
      if (cell && cell.player === currentPlayer) {
        selectedFromBoardIndex = index;
        renderBoard();
      } else {
        selectedFromBoardIndex = null;
        renderBoard();
      }
    }
    return;
  }

  // No selection yet.
  if (cell && cell.player === currentPlayer) {
    // Selecting a piece to move (only allowed once moving is unlocked)
    if (canCurrentPlayerMovePieces()) {
      selectedFromBoardIndex = index;
      selectedPoolPiece = null;
      renderBoard();
    }
    return;
  }

  // Empty cell clicked: try to place a selected pool piece, if any.
  if (!cell && selectedPoolPiece && selectedPoolPiece.player === currentPlayer) {
    placePiece(currentPlayer, selectedPoolPiece.type, index);
    return;
  }
}

/****************************************************
 * Move history helpers (keyboard left/right to browse)
 ****************************************************/

function recordHistorySnapshot() {
  // Deep-ish copy of current game state for replay
  const snapshot = {
    board: board.map(cell => (cell ? { ...cell } : null)),
    pools: {
      X: pools.X.slice(),
      O: pools.O.slice()
    },
    currentPlayer,
    gameOver,
    lastMoveIndex: lastMoveIndex  // Track which square the last move ended on
  };

  // If we had rewound, drop any "future" moves
  if (moveIndex >= 0 && moveIndex < moveHistory.length - 1) {
    moveHistory = moveHistory.slice(0, moveIndex + 1);
  }

  moveHistory.push(snapshot);
  moveIndex = moveHistory.length - 1;
}

function stepHistory(direction) {
  if (!moveHistory.length) return;
  const newIndex = moveIndex + direction;
  // Valid indices are 0 to moveHistory.length - 1
  if (newIndex < 0 || newIndex >= moveHistory.length) return;

  moveIndex = newIndex;
  const snapshot = moveHistory[moveIndex];
  
  // Safety check: ensure snapshot exists and has required properties
  if (!snapshot || !snapshot.board || !snapshot.pools) return;

  board = snapshot.board.map(cell => (cell ? { ...cell } : null));
  pools = {
    X: snapshot.pools.X.slice(),
    O: snapshot.pools.O.slice()
  };
  currentPlayer = snapshot.currentPlayer;
  gameOver = snapshot.gameOver;
  // Restore last move highlight from snapshot (or null if not set)
  lastMoveIndex = snapshot.lastMoveIndex !== undefined ? snapshot.lastMoveIndex : null;

  renderBoard();
  renderPiecePools();
}

function handleHistoryKeyDown(event) {
  if (event.key === "ArrowLeft") {
    stepHistory(-1);
  } else if (event.key === "ArrowRight") {
    stepHistory(1);
  }
}

/****************************************************
 * Initial setup
 ****************************************************/

function initGame() {
  board = Array(BOARD_CELLS).fill(null);
  pools = {
    [PLAYER_X]: PIECE_TYPES.slice(), // P, R, N, B
    [PLAYER_O]: PIECE_TYPES.slice()
  };
  currentPlayer = PLAYER_X;
  gameOver = false;
  selectedFromBoardIndex = null;
  selectedPoolPiece = null;
  isAiThinking = false;

  // Reset last-move highlight
  lastMoveIndex = null;

  // Reset history and record initial position
  moveHistory = [];
  moveIndex = -1;

  // Attach drag & drop handlers to board cells
  for (let i = 0; i < BOARD_CELLS; i++) {
    const cellEl = document.getElementById("cell-" + i);
    if (!cellEl) continue;
    cellEl.addEventListener("dragover", onCellDragOver);
    cellEl.addEventListener("drop", function (event) {
      onCellDrop(event, i);
    });
  }

  renderBoard();
  renderPiecePools();

  // Attach global keyboard listener for history once
  if (!window.__ctttHistoryKeysBound) {
    window.__ctttHistoryKeysBound = true;
    window.addEventListener("keydown", handleHistoryKeyDown);
  }

  // Update active mode button styling
  const buttons = document.querySelectorAll("[data-mode-button]");
  buttons.forEach(btn => {
    const mode = btn.getAttribute("data-mode");
    btn.classList.toggle("mode-active", mode === gameMode);
  });

  // Initialize online mode if it's the default
  if (gameMode === "online" && !socket) {
    socket = io();
    setupSocketHandlers();
    socket.emit("findOrCreateRoom");
  }

  // Record the initial (empty) position as move 1 in history
  recordHistorySnapshot();
}

function setGameMode(mode) {
  if (mode !== "ai" && mode !== "human" && mode !== "online") {
    mode = "human";
  }
  
  // Disconnect socket if switching away from online
  if (gameMode === "online" && mode !== "online" && socket) {
    socket.disconnect();
    socket = null;
    onlinePlayerId = null;
    roomId = null;
    isRoomFull = false;
  }
  
  // Connect socket if switching to online
  if (mode === "online" && !socket) {
    socket = io();
    setupSocketHandlers();
    // Automatically find or create a room
    socket.emit("findOrCreateRoom");
    document.getElementById("room-ui").style.display = "none"; // Hide room UI
  }
  
  gameMode = mode;
  initGame();
}

/****************************************************
 * Online multiplayer (Socket.IO)
 ****************************************************/

function setupSocketHandlers() {
  if (!socket) return;

  socket.on("roomCreated", (data) => {
    roomId = data.roomId;
    onlinePlayerId = data.playerId;
    isRoomFull = data.isFull || false;
    // Update status to show waiting for opponent
    updateStatus();
  });

  socket.on("roomJoined", (data) => {
    roomId = data.roomId;
    isRoomFull = data.isFull || (data.playersCount === 2);
    // Find our player ID from the players list
    // The server sends players array with { id: socketId, playerId: 'X'|'O' }
    const ourPlayer = data.players.find(p => p.id === socket.id);
    if (ourPlayer && ourPlayer.playerId) {
      onlinePlayerId = ourPlayer.playerId;
    } else {
      // Fallback: if we can't find ourselves, assign based on order
      // Second player to join is always O
      onlinePlayerId = data.players.length === 2 ? "O" : "X";
    }
    syncGameStateFromServer(data.gameState);
  });

  socket.on("gameStateUpdate", (gameState) => {
    syncGameStateFromServer(gameState);
  });

  socket.on("onlineCount", (count) => {
    onlineCount = count;
    // Only bother updating status in online mode
    if (gameMode === "online") {
      updateStatus();
    }
  });

  socket.on("error", (data) => {
    alert(data.message || "An error occurred");
  });

  socket.on("playerDisconnected", (data) => {
    if (data.reason === "opponent_disconnected") {
      // Opponent disconnected during a game - winner message will come via gameStateUpdate
      const opponentColor = data.playerId === "X" ? "White" : "Black";
      const statusEl = document.getElementById("status");
      if (statusEl) {
        statusEl.textContent = `${opponentColor} disconnected. You win!`;
        statusEl.classList.add("status-strong");
      }
    } else {
      // Player disconnected while waiting for opponent
      const statusEl = document.getElementById("status");
      if (statusEl) {
        statusEl.textContent = "Opponent disconnected. Waiting for a new opponent...";
      }
      isRoomFull = false;
      updateStatus();
    }
  });
}

function syncGameStateFromServer(gameState) {
  // Preserve onlinePlayerId - don't let it get reset
  const savedPlayerId = onlinePlayerId;
  
  // Store previous board to detect last move destination
  const previousBoard = board && board.length > 0 ? board.map(cell => cell ? { ...cell } : null) : null;
  const previousCurrentPlayer = currentPlayer;
  
  board = gameState.board.map(cell => cell ? { ...cell } : null);
  pools = {
    X: gameState.pools.X.slice(),
    O: gameState.pools.O.slice()
  };
  currentPlayer = gameState.currentPlayer;
  gameOver = gameState.gameOver;
  
  // Detect last move destination by comparing boards (only if turn changed, indicating a move was made)
  if (previousBoard && previousCurrentPlayer && previousCurrentPlayer !== currentPlayer && !gameOver) {
    // Find squares that changed - the destination of the last move
    for (let i = 0; i < BOARD_CELLS; i++) {
      const oldCell = previousBoard[i];
      const newCell = board[i];
      
      // If a square became occupied (placement) or changed (move/capture), it's the last move destination
      if ((!oldCell && newCell) || (oldCell && newCell && 
          (oldCell.player !== newCell.player || oldCell.type !== newCell.type || 
           (oldCell.dir !== newCell.dir)))) {
        lastMoveIndex = i;
        break; // Take the first change found (should be the move destination)
      }
    }
  } else if (!previousBoard) {
    // Initial state - no last move yet
    lastMoveIndex = null;
  }
  
  // Update move history for online games as well
  recordHistorySnapshot();
  
  // Restore onlinePlayerId if it was set
  if (savedPlayerId) {
    onlinePlayerId = savedPlayerId;
  }
  
  renderBoard();
  renderPiecePools();
  
  // Update status after syncing state
  updateStatus();
  
  if (gameState.winner) {
    endGame((gameState.winner === "X" ? "White" : "Black") + " wins!");
  } else if (gameState.gameOver) {
    endGame("Draw!");
  }
}

// Room functions kept for backward compatibility but not used in auto-join flow
function createRoom() {
  if (!socket) {
    alert("Please select Online mode first");
    return;
  }
  socket.emit("createRoom");
}

function joinRoom() {
  if (!socket) {
    alert("Please select Online mode first");
    return;
  }
  const roomIdInput = document.getElementById("room-id-input").value.trim();
  if (!roomIdInput) {
    alert("Please enter a room ID");
    return;
  }
  socket.emit("joinRoom", { roomId: roomIdInput });
}

