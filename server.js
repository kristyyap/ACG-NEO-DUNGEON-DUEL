const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;
const MAX_PLAYERS = 4;
const GAME_DURATION = 120000; // 120 seconds in milliseconds
const freeSlots = [0, 1, 2, 3];

app.use(express.static(path.join(__dirname, 'public')));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

const players = {};
const coinsById = Object.create(null);
const playerNames = Object.create(null);
let gameStartTime = null;
let timerInterval = null;
let gameStarted = false;
let paused = false;
let pausedTime = 0;
let readyPlayers = new Set();

function isSoloMode() {
  return Object.keys(players).length === 1;
}

function resetGame() {
  clearInterval(timerInterval);
  timerInterval = null;
  gameStartTime = null;
  gameStarted = false;
  paused = false;
  pausedTime = 0;
  readyPlayers.clear();
  io.emit('timerUpdate', { remaining: Math.floor(GAME_DURATION / 1000) });
  console.log('Game state reset');
}

function startGameTimer() {
  if (timerInterval || gameStarted) {
    console.log('Timer already running or game started, ignoring startGame');
    return;
  }
  gameStarted = true;
  paused = false;
  pausedTime = 0;
  gameStartTime = Date.now();
  timerInterval = setInterval(() => {
    if (!paused) {
      const elapsed = Date.now() - gameStartTime - pausedTime;
      const remaining = Math.max(0, Math.floor((GAME_DURATION - elapsed) / 1000));
      io.emit('timerUpdate', { remaining });
      if (remaining <= 0) {
        clearInterval(timerInterval);
        timerInterval = null;
        gameStarted = false;
        io.emit('gameOver');
        resetGame();
        console.log('Game over, timer reset');
      }
    }
  }, 1000);
  console.log('Timer started');
}

function pauseGameTimer() {
  if (!isSoloMode() || paused || !gameStarted) {
    console.log('Pause ignored: not solo mode, already paused, or game not started');
    return;
  }
  paused = true;
  pausedTime += Date.now() - gameStartTime - pausedTime;
  io.emit('gamePaused', { paused: true });
  console.log('Timer paused');
}

function resumeGameTimer() {
  if (!isSoloMode() || !paused || !gameStarted) {
    console.log('Resume ignored: not solo mode, not paused, or game not started');
    return;
  }
  paused = false;
  gameStartTime = Date.now();
  io.emit('gamePaused', { paused: false });
  console.log('Timer resumed');
}

io.on('connection', socket => {
  if (freeSlots.length === 0) {
    socket.emit('roomFull');
    socket.disconnect(true);
    console.log(`Connection rejected: room full (socket ${socket.id})`);
    return;
  }

  const slot = freeSlots.shift();
  players[socket.id] = {
    slot,
    position: { x: 0, y: 1.6, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    name: '',
    ready: false,
  };

  console.log(`Player joined: socket ${socket.id}, slot ${slot}, IP ${socket.handshake.address}`);

  socket.emit('currentPlayers',
    Object.entries(players).map(([id, p]) => ({ id, ...p }))
  );
  socket.broadcast.emit('newPlayer', { id: socket.id, data: players[socket.id] });

  socket.emit('playersRanking',
    Object.entries(coinsById).map(([id, coins]) => ({
      id,
      coins,
      name: playerNames[id] || players[id]?.name || 'Anon',
    }))
  );

  const elapsed = gameStartTime ? Date.now() - gameStartTime - pausedTime : 0;
  const remaining = gameStarted ? Math.max(0, Math.floor((GAME_DURATION - elapsed) / 1000)) : 120;
  socket.emit('timerUpdate', { remaining });
  socket.emit('gamePaused', { paused });
  socket.emit('readyStatus', {
    readyCount: readyPlayers.size,
    totalPlayers: Object.keys(players).length,
  });
  console.log(`Sent initial timer state to ${socket.id}: remaining ${remaining}, paused ${paused}`);

  socket.on('startGame', () => {
    if (players[socket.id]?.slot === 0 && !gameStarted) {
      startGameTimer();
      io.emit('gameStarted');
      console.log(`Game started by host ${socket.id} (slot 0)`);
    } else {
      console.log(`startGame ignored: socket ${socket.id}, slot ${players[socket.id]?.slot}, gameStarted ${gameStarted}`);
    }
  });

  socket.on('playerReady', () => {
    if (!players[socket.id]) return;
    players[socket.id].ready = true;
    readyPlayers.add(socket.id);
    io.emit('readyStatus', {
      readyCount: readyPlayers.size,
      totalPlayers: Object.keys(players).length,
    });
    console.log(`Player ${socket.id} ready, readyCount: ${readyPlayers.size}/${Object.keys(players).length}`);
  });

  socket.on('pauseGame', () => {
    if (isSoloMode() && gameStarted) {
      pauseGameTimer();
    }
  });

  socket.on('resumeGame', () => {
    if (isSoloMode() && gameStarted) {
      resumeGameTimer();
    }
  });

  socket.on('setName', rawName => {
    if (!players[socket.id]) return;
    const name = String(rawName || '').trim().slice(0, 16) || 'Anon';
    players[socket.id].name = name;
    playerNames[socket.id] = name;
    io.emit('playerNameUpdated', { id: socket.id, name });
    console.log(`Player ${socket.id} set name: ${name}`);
  });

  socket.on('updateMovement', data => {
    if (!players[socket.id]) return;
    players[socket.id].position = data.position;
    players[socket.id].rotation = data.rotation;
    io.emit('playerMoved', { id: socket.id, data });
  });

  socket.on('goldChanged', ({ coins }) => {
    coinsById[socket.id] = coins ?? 0;
    io.emit('goldChanged', { id: socket.id, coins });
  });

  socket.on('disconnect', () => {
    const me = players[socket.id];
    if (me) {
      freeSlots.unshift(me.slot);
      console.log(`Player disconnected: socket ${socket.id}, slot ${me.slot} returned to freeSlots`);
    }
    delete players[socket.id];
    delete coinsById[socket.id];
    delete playerNames[socket.id];
    readyPlayers.delete(socket.id);
    io.emit('removePlayer', socket.id);
    io.emit('readyStatus', {
      readyCount: readyPlayers.size,
      totalPlayers: Object.keys(players).length,
    });
    if (Object.keys(players).length === 0) {
      resetGame();
      console.log('All players disconnected, game reset');
    } else if (Object.keys(players).length === 1 && gameStarted && !paused) {
      // Only pause if exactly one player remains (solo mode)
      pauseGameTimer();
    } else {
      console.log(`Multiplayer mode continues, players: ${Object.keys(players).length}`);
    }
  });
});