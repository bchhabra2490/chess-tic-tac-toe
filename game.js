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

// Modes: "human" (2 players) or "ai" (human vs AI as Black)
let gameMode = "ai";
let isAiThinking = false;

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

function renderBoard() {
  for (let i = 0; i < BOARD_CELLS; i++) {
    const cellEl = document.getElementById("cell-" + i);
    if (!cellEl) continue;

    const contentEl = cellEl.querySelector(".cell-content") || cellEl;
    const cell = board[i];

    cellEl.classList.remove("cell-x", "cell-o", "cell-selected");

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
    } else {
      contentEl.textContent = "";
    }
  }

  if (selectedFromBoardIndex !== null) {
    const selEl = document.getElementById("cell-" + selectedFromBoardIndex);
    if (selEl) {
      selEl.classList.add("cell-selected");
    }
  }

  updateStatus();
}

function renderPiecePools() {
  const humanContainer = document.getElementById("human-pieces");
  const aiContainer = document.getElementById("ai-pieces");

  if (humanContainer) {
    humanContainer.innerHTML = "";
    pools[PLAYER_X].forEach(type => {
      const el = createPieceElement(PLAYER_X, type);
      humanContainer.appendChild(el);
    });
  }

  if (aiContainer) {
    aiContainer.innerHTML = "";
    pools[PLAYER_O].forEach(type => {
      const el = createPieceElement(PLAYER_O, type);
      aiContainer.appendChild(el);
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
    // In AI mode, only allow White (human) to select from the pool
    if (gameMode === "ai" && currentPlayer === PLAYER_O) return;
    selectedPoolPiece = { player, type };
    selectedFromBoardIndex = null;
    updateStatus();
  });

  return container;
}

function updateStatus() {
  const statusEl = document.getElementById("status");
  if (!statusEl) return;

  if (gameOver) return;

  const canMove = canCurrentPlayerMovePieces();
  const poolCount = pools[currentPlayer].length;
  const movePart = canMove
    ? poolCount > 0
      ? "Place a piece or move one of your pieces."
      : "Move one of your pieces."
    : "Place a piece.";

  const colorName = currentPlayer === PLAYER_X ? "White" : "Black";
  const modeLabel = gameMode === "ai" ? " (vs AI)" : "";
  statusEl.textContent = colorName + " to play" + modeLabel + ". " + movePart;

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

  const player = slot.dataset.player;
  const type = slot.dataset.piece;
  if (!player || !type) return;
  if (player !== currentPlayer || gameOver) return;
  // In AI mode, human can only control White (PLAYER_X)
  if (gameMode === "ai" && currentPlayer === PLAYER_O) return;

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
  if (gameMode === "ai" && currentPlayer === PLAYER_O) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
}

function onCellDrop(event, index) {
  event.preventDefault();
  if (gameOver) return;
  if (gameMode === "ai" && currentPlayer === PLAYER_O) return;

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
  if (player !== currentPlayer) return;
  if (board[index] !== null) return;

  const pool = pools[player];
  const idx = pool.indexOf(type);
  if (idx === -1) return;

  const piece = { player, type };
  if (type === "P") {
    // Initial direction: X pawns go "down" (increasing row),
    // O pawns go "up" (decreasing row).
    piece.dir = player === PLAYER_X ? -1 : 1;
  }

  board[index] = piece;
  pool.splice(idx, 1);

  selectedPoolPiece = null;
  selectedFromBoardIndex = null;

  afterAction();
}

function tryMovePiece(fromIndex, toIndex) {
  if (gameOver) return false;
  if (!canCurrentPlayerMovePieces()) return false;

  const fromCell = board[fromIndex];
  if (!fromCell || fromCell.player !== currentPlayer) return false;
  if (fromIndex === toIndex) return false;

  const toCell = board[toIndex];
  if (toCell && toCell.player === currentPlayer) return false;

  if (!isLegalMove(fromIndex, toIndex, fromCell)) {
    return false;
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
    const { row, col } = indexToRowCol(toIndex);
    const atRowEdge = row === 0 || row === BOARD_SIZE - 1;
  
    if (atRowEdge) {
      board[toIndex].dir = -1 * fromCell.dir;
    }
  }

  selectedFromBoardIndex = null;
  selectedPoolPiece = null;

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
  // Pawn always moves strictly according to its current direction.
  // If direction is missing, the move is not allowed.
  if (typeof piece.dir !== "number") return false;
  const dir = piece.dir;
  const forwardRow = fr + dir;
  const backwardRow = fr - dir;


  // Forward move (no capture)
  if (tc === fc && tr === forwardRow) {
    const idx = rowColToIndex(tr, tc);
    if (board[idx] === null) return true;
  }

  if ((fr === 0 || fr === BOARD_SIZE - 1) && tr === backwardRow) {
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
  const forwardRow = fr + dir;
  const backwardRow = fr - dir;
  if (tc === fc && tr === forwardRow) {
    if (b[rowColToIndex(tr, tc)] === null) return true;
  }
  if ((fr === 0 || fr === BOARD_SIZE - 1) && tr === backwardRow) {
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
    piece.dir = player === PLAYER_X ? -1 : 1;
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
      b[toIndex].dir = -fromCell.dir;
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
  const winner = checkWinner(board);
  if (winner) {
    endGame((winner === PLAYER_X ? "White" : "Black") + " wins!");
    renderBoard();
    renderPiecePools();
    return;
  }

  if (isBoardFull(board)) {
    endGame("Draw!");
    renderBoard();
    renderPiecePools();
    return;
  }

  currentPlayer = currentPlayer === PLAYER_X ? PLAYER_O : PLAYER_X;
  renderBoard();
  renderPiecePools();

  if (!gameOver) {
    maybeTriggerAiTurn();
  }
}

/****************************************************
 * Click handler for board cells
 ****************************************************/

function handleCellClick(index) {
  if (gameOver) return;
  // In AI mode, ignore clicks when it's the AI's turn (Black)
  if (gameMode === "ai" && currentPlayer === PLAYER_O) return;

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

  // Update active mode button styling
  const buttons = document.querySelectorAll("[data-mode-button]");
  buttons.forEach(btn => {
    const mode = btn.getAttribute("data-mode");
    btn.classList.toggle("mode-active", mode === gameMode);
  });
}

function setGameMode(mode) {
  if (mode !== "ai" && mode !== "human") {
    mode = "human";
  }
  gameMode = mode;
  initGame();
}

