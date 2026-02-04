# Chess Tic-Tac-Toe

A strategic chess variant combining tic-tac-toe mechanics with chess piece movements on a 4×4 board.

## Features

- **Local 2-Player Mode**: Play against a friend on the same device
- **AI Mode**: Challenge a minimax-powered AI opponent
- **Online Multiplayer**: Play against opponents over the internet using Socket.IO

## Setup

### Install Dependencies

```bash
npm install
```

### Run the Server

```bash
npm start
```

The server will start on `http://localhost:3000` (or the port specified in the `PORT` environment variable).

### Play Online

1. Open `http://localhost:3000` in your browser
2. Click "Online" mode
3. **To create a room**: Click "Create Room" and share the Room ID with your opponent
4. **To join a room**: Enter the Room ID and click "Join Room"

## Game Rules

- Each player has one pawn, rook, knight, and bishop
- Players take turns placing pieces on empty squares
- Once both players have 3 pieces on the board, players can either:
  - Place a remaining piece, OR
  - Move one of their pieces (using standard chess movement rules)
- Pawns reverse direction when they reach any board edge
- Captured pieces return to their owner's pool to be placed again
- First to get 4 pieces in a row (horizontal, vertical, or diagonal) wins!

## Technologies

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js, Express, Socket.IO
- **AI**: Minimax algorithm with alpha-beta pruning

## Development

To run in development mode:

```bash
npm run dev
```

## License

MIT
