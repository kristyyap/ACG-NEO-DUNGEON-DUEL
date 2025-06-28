// server.js – minimal Express + Socket.io hub (modern style)

const express = require('express');
const http    = require('http');          // plain Node HTTP
const { Server } = require('socket.io');  // ES-style import from socket.io
const path    = require('path');

const app    = express();
const server = http.createServer(app);    // wrap Express in a raw HTTP server
const io     = new Server(server);        // pass that server to Socket.io

const PORT         = 3000;                // or any free port ≥ 1024
const MAX_PLAYERS  = 4;
const freeSlots    = [0, 1, 2, 3];

// ─────────────────────────────────────────────────────────
// static files (client JS, textures, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// listen on all network interfaces so other laptops can reach us
server.listen(PORT, '0.0.0.0', () => {
  console.log(`open http://localhost:${PORT}`);
});

// ─────────────────────────────────────────────────────────
// in-memory list of players: { id: { position, rotation, slot } }
const players = {};
const coinsById   = Object.create(null);
const playerNames = Object.create(null);

// new connection
io.on('connection', socket => {
  if (freeSlots.length === 0) {
    socket.emit('roomFull');
    socket.disconnect(true);
    return;
  }

  const slot = freeSlots.shift();
  players[socket.id] = {
    slot,
    position: { x: 0, y: 1.6, z: 0 },   // eyes 1.6 m above floor
    rotation: { x: 0, y: 0, z: 0 },
    name:'',
  };

  console.log(`▶ join ${socket.id} → slot ${slot}`);

  // send full roster
  socket.emit('currentPlayers',
    Object.entries(players).map(([id, p]) => ({ id, ...p }))
  );
  socket.broadcast.emit('newPlayer', { id: socket.id, data: players[socket.id] });

   /* NEW – initial full ranking (so lobby screens are up-to-date) */
  socket.emit('playersRanking',
    Object.entries(coinsById).map(([id, coins]) => ({
      id,
      coins,
      name: playerNames[id] || players[id]?.name || 'Anon'
    }))
  );


  socket.on('setName', rawName=>{
    if(!players[socket.id]) return;
    const name = String(rawName||'').trim().slice(0,16) || 'Anon';
    players[socket.id].name = name;
    playerNames[socket.id] = name;

    io.emit('playerNameUpdated',{ id:socket.id, name });
  });

  // movement from a client
  socket.on('updateMovement', data => {
    if (!players[socket.id]) return;
    players[socket.id].position = data.position;
    players[socket.id].rotation = data.rotation;
    io.emit('playerMoved', { id: socket.id, data });
  });

  /* NEW – single-player coin total changed */
  socket.on('goldChanged', ({ coins }) => {
    coinsById[socket.id] = coins ?? 0;           // store
    io.emit('goldChanged', {                     // rebroadcast so
      id:    socket.id,                          //   every client
      coins                                        //   updates its panel
    });
  });

  /* ===== disconnect ===== */
  socket.on('disconnect', () => {
    const me = players[socket.id];
    if (me) freeSlots.unshift(me.slot);   // slot becomes free again
    delete players[socket.id];
    io.emit('removePlayer', socket.id);
  });
});
