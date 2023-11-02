const express = require("express");
const io = require("socket.io")({ path: "/webrtcapp" });
const app = express();
const port = 8080;

const rooms = {};

// app.get("/", (req, res) => res.send("Hello, world!"));
app.use(express.static(__dirname + "/build"));
app.use("/", (req, res, next) => {
  //default room
  res.sendFile(__dirname + "/build/index.html");
});
app.use("/:room", (req, res, next) => {
  res.sendFile(__dirname + "/build/index.html");
});

const server = app.listen(port, () =>
  console.log(`Server running on port ${port}`)
);
io.listen(server);
io.on("connection", (socket) => {
  console.log("connected");
});
const peers = io.of("/webrtcPeer");
//keep record of all socket connections
// let connectedPeers = new Map();

peers.on("connection", (socket) => {
  const room = socket.handshake.query.room;
  rooms[room] =
    (rooms[room] && rooms[room].set(socket.id, socket)) ||
    new Map().set(socket.id, socket);
  // connectedPeers.set(socket.id, socket);
  console.log(socket.id);
  socket.emit("connection-success", {
    success: socket.id,
    peerCount: rooms[room].size,
  });

  // const broadcast = () =>
  //   socket.broadcast.emit("joined-peers", {
  //     peerCount: connectedPeers.size,
  //   });
  const broadcast = () => {
    const _connectedPeers = rooms[room];

    for (const [socketID, _socket] of _connectedPeers.entries()) {
      if (socketID !== socket.id) {
        _socket.emit("joined-peers", {
          peerCount: rooms[room].size,
        });
      }
    }
  };
  broadcast();

  // connectedPeers.set(socket.id, socket);

  // const disconnectedPeer = (socketID) =>
  //   socket.broadcast.emit("peer-disconnected", {
  //     peerCount: connectedPeers.size,
  //     sockeID: socketID,
  //   });
  const disconnectedPeer = (socketID) => {
    const _connectedPeers = rooms[room];
    for (const [socketID, _socket] of _connectedPeers.entries()) {
      _socket.emit("peer-disconnected", {
        peerCount: rooms[room].size,
        socketID,
      });
    }
  };
  // socket.on('new-message', (data) => {
  //   console.log('new-message', JSON.parse(data.payload))

  //   messages[room] = [...messages[room], JSON.parse(data.payload)]
  // })

  socket.on("disconnect", () => {
    console.log("disconnected");
    // connectedPeers.delete(socket.id);
    rooms[room].delete(socket.id);
    disconnectedPeer(socket.id);
  });
  socket.on("onlinePeers", (data) => {
    const _connectedPeers = rooms[room];
    for (const [socketID] of _connectedPeers.entries()) {
      //dont send to self
      if (socketID !== data.socketID.local) {
        console.log("online-peer", data.socketID, socketID);
        socket.emit("online-peer", socketID);
      }
    }
  });

  socket.on("offer", (data) => {
    const _connectedPeers = rooms[room];
    for (const [socketID, socket] of _connectedPeers.entries()) {
      if (socketID === data.socketID.remote) {
        // console.log(socketID, data.payload.type);
        socket.emit("offer", {
          sdp: data.payload,
          socketID: data.socketID.local,
        });
      }
    }
  });

  socket.on("answer", (data) => {
    const _connectedPeers = rooms[room];
    for (const [socketID, socket] of _connectedPeers.entries()) {
      if (socketID === data.socketID.remote) {
        console.log("Answer", socketID, data.socketID, data.payload.type);
        socket.emit("answer", {
          sdp: data.payload,
          socketID: data.socketID.local,
        });
      }
    }
  });
  // socket.on("offerOrAnswer", (data) => {
  //   //send to other peers if any
  //   for (const [socketID, socket] of connectedPeers.entries()) {
  //     //dont send to self
  //     if (socketID !== data.socketID) {
  //       console.log(socketID, data.payload.type);
  //       socket.emit("offerOrAnswer", data.payload);
  //     }
  //   }
  // });
  socket.on("candidate", (data) => {
    //send to other peers if any
    const _connectedPeers = rooms[room];
    for (const [socketID, socket] of _connectedPeers.entries()) {
      //dont send to self
      if (socketID === data.socketID.remote) {
        // console.log(socketID, data.payload.type);
        socket.emit("candidate", {
          candidate: data.payload,
          socketID: data.socketID.local,
        });
      }
    }
  });
});
