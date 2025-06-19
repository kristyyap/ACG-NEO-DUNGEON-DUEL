// server.js  – minimal Express + Socket.io hub
const express = require('express');
const app     = express();
const http    = require('http').createServer(app);
const io      = require('socket.io')(http);

const PORT = 3000;
const MAX_PLAYERS = 4;
const freeSlots   = [0, 1, 2, 3]; 

// serve everything under /public
app.use(express.static(__dirname + '/public'));

//TO CHANGE --> http.listen(PORT, '0.0.0.0', () => {        use this for different computer
http.listen(PORT, '0.0.0.0', () => {
  console.log(`🎮  open http://localhost:${PORT}`);
});

// ─────────────────────────────────────────────────────────
// in-memory list of players: { id: { position, rotation } }
const players = {};

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
  };

  console.log(`▶ join ${socket.id} → slot ${slot}`); 

  // socket.emit('currentPlayers', players);     // send full roster
  socket.emit('currentPlayers', Object.entries(players).map(
    ([id, p]) => ({ id, ...p })
  ));
  socket.broadcast.emit('newPlayer', { id: socket.id, data: players[socket.id] });

  // movement from a client
  // socket.on('updateMovement', data => {
  //   if (!players[socket.id]) return;
  //   players[socket.id] = data;
  //   io.emit('playerMoved', { id: socket.id, data });              // echo to *all* clients
  // });
  socket.on('updateMovement', data => {
    if (!players[socket.id]) return;
    players[socket.id].position = data.position;
    players[socket.id].rotation = data.rotation;
    io.emit('playerMoved', { id: socket.id, data });
  });

  /* ===== disconnect ===== */
  socket.on('disconnect', () => {
    const me = players[socket.id];
    if (me) freeSlots.unshift(me.slot);   // slot becomes free again
    delete players[socket.id];
    io.emit('removePlayer', socket.id);
  });
});
