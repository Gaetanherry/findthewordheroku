const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const port = process.env.PORT || 3000;
//const index = require("./routes/index");

const app = express();
//app.use(index);

const server = http.createServer(app);

const io = socketIo(server);

app.use(express.static(path.join(__dirname, '../../build')));

app.get('/', (req, res, next) => res.sendFile(__dirname + './index.html'));


/* object player {
  name : String;
  socket : String;
  ready : Boolean;
  alive : Boolean;
  turnDone : Boolean;
  votes : Number;
  disconnected : Boolean;
} */

let players = [], sockets=[]; 
let totalPlayers = 0, gameState = 0, mrWhite = 0, turn = 0, deads = 0, votesDone = 0;
let word = "";
const wordlength = 503;

const getPlayersName = () => {
  return (players.length === 0 && []) || players.map(player => {
    return player.name;
  });
}

const getPlayersDisconnected = () => {
  return (players.length === 0 && []) || players.map(player => {
    return player.disconnected;
  });
}

const getPlayersReady = () => {
  return (players.length === 0 && []) || players.map(player => {
    return player.ready;
  });
}

const getPlayersTurnDone = () => {
  return (players.length === 0 && []) || players.map(player => {
    return player.turnDone;
  });
}

const getPlayersVotes = () => {
  return (players.length === 0 && []) || players.map(player => {
    return player.votes;
  });
}

const nthline = require('nthline'), filePath = './src/server/words.txt';

function findWord() {
  let rowNumber = Math.floor(Math.random() * wordlength) +1;
  nthline(rowNumber, filePath).then(line => {
    word = line;
    sockets.forEach( (socket,i) => {
      if(mrWhite === i) {
        socket.emit("mrWhite",true)
      } else {
        socket.emit("mrWhite",false);
        socket.emit("word",word);
      }
    });
  });
}

const resetGame = () => {
  players = [];
  sockets = [];
  totalPlayers = 0;
  gameState = 0;
  mrWhite = 0;
  turn = 0;
  deads = 0;
  votesDone = 0;
  word = "";
}

const addPlayer = (socket,name) => {
  let i = getPlayersName().indexOf(name);
  if (gameState === 0) {
    if (i !== -1) { // ce nom existe déjà
      socket.emit("nameTaken");
    } else {
      players.push({
        name : name,
        socket : socket.id,
        ready : false,
        alive : true,
        turnDone : false,
        votes : 0,
        disconnected : false});
      sockets.push(socket);
      console.log("New Player "+name+" connected.");
      socket.emit("registered");
      io.emit("players", players);
      if (players.length>totalPlayers) {
        addTotalPlayer(players.length-totalPlayers);
      } else {
        socket.emit("totalPlayers",totalPlayers);
      }
    }
  } else if(i !== -1 && players[i].disconnected){
    players[i].disconnected = false;
    players[i].socket = socket.id;
    sockets[i] = socket;
    console.log("Player "+players[i].name+" reconnected.");
    socket.emit("registered");
    io.emit("players",players);
    socket.emit("totalPlayers",totalPlayers);
    socket.emit("turn",turn);
    if (i === mrWhite) {
      socket.emit("mrWhite", true);
    } else {
      socket.emit("mrWhite", false);
      socket.emit("word",word);
    }
    if (gameState === 2) {
      socket.emit("voteState");
    }
  } else {
    socket.emit("newGame"); // gamestate 1 pour qu'on demande d'attendre
  }
}

const removePlayer = socket => {
  let i = sockets.indexOf(socket);
    if (i !== -1) {
      console.log("Player "+players[i].name+" disconnected");
      if (gameState === 0) {
        players.splice(i, 1);
        sockets.splice(i, 1);
        io.emit("players", players);
      } else {
        players[i].disconnected=true;
        io.emit("players", players);

        if(getPlayersDisconnected().reduce(function(acc,curr) { // si tout le monde est déco
          return acc && curr;
        })) {
          resetGame();
        }
      }
  }
}

const addTotalPlayer = (nb) => {
  totalPlayers+=nb;

  if (totalPlayers < players.length) { 
    totalPlayers = players.length; 
  }

  io.emit("totalPlayers",totalPlayers);

  if (getPlayersReady().length > 0 && getPlayersReady().reduce(function(acc,curr) { // si tout le monde ready et si on est plus de 2
    return acc && curr;
  }) && players.length > 2 && players.length === totalPlayers) {
    gameState = 1;
    newGame();
  };
}

const setReady = (socket,readyBool) => {
  let i = sockets.indexOf(socket);  
  players[i].ready = readyBool;
  io.emit("players",players);

  if (getPlayersReady().reduce(function(acc,curr) { // si tout le monde ready et si on est plus de 2
    return acc && curr;
  }) && players.length > 2 && players.length === totalPlayers) {
    gameState = 1;
    newGame();
  };
}

const newGame = () => {
  mrWhite = Math.floor(Math.random() * players.length);
  findWord();

  players.forEach(player => {
    player.turnDone = false;
    player.alive = true;
    player.disconnected = false;
  });
  io.emit("players",players);
  turn = Math.floor(Math.random() * players.length);
  if(turn === mrWhite) {turn = Math.floor(Math.random() * players.length)}; // Mr White 2x moins de chance d'etre premier
  io.emit("turn",turn);
  io.emit("newGame");
}

const nextTurn = () => {
  players[turn].turnDone = true;
  io.emit("players", players);
  if (getPlayersTurnDone().reduce(function(acc,curr,i) { // si tout le monde de vivant a fait son tour
    if (i === 1) {
      return (acc || !players[0].alive) && (curr || !players[1].alive);
    }
    return acc && (curr || !players[i].alive);
  })) {
    gameState = 2;
    players.forEach( player => {
      player.votes = 0;
    })
    votesDone = 0;
    io.emit("players", players);
    io.emit("voteState");
  } else { // il reste un tour à jouer au moins
    turn++;
    if (turn === players.length) {
      turn = 0;
    }

    while (!players[turn].alive) {
      turn++;
      if (turn === players.length) {
        turn = 0;
      }
    }
    io.emit("turn",turn);
  }
}

const giveVote = votes => { // votes[0] ancien votes[1] nouveau
  if (votes[0] === -1) {
    votesDone++;
  } else {
    players[votes[0]].votes--;
  }
  players[votes[1]].votes++;
  io.emit("players", players);

  if(votesDone === players.length - deads) { //tout le monde a voté
    let isMajority = true, index = 0;
    getPlayersVotes().reduce(function(acc,curr,i) { // s'il y a une majorité unique
      if(curr > acc) {
        isMajority = true;
        index = i;
        return curr;
      } else if(curr === acc) {
        isMajority = false;
        return curr;
      } else {
        return acc;
      }
    });

    if (isMajority) {
      players[index].alive= false;
      deads++;
      io.emit("death",index)
      io.emit("players",players);
      if (index === mrWhite) {
        io.emit("mrWhiteDead");
        setTimeout(restartGame, 5000);
      } else {
        if (players.length - deads === 2) {
          io.emit("mrWhiteWon");
          setTimeout(restartGame, 5000);
        } else {
          setTimeout(setBackTurns, 5000); 
        }
      }
    }
  }
}

const setBackTurns = () => {
  players.forEach(player => {
    player.turnDone = false;
    player.votes = 0;
  });
  votesDone = 0;
  io.emit("players", players);
  turn = Math.floor(Math.random() * (players.length - deads));

  let i=0;
  while(i<=turn) {
    if (!players[i].alive) {
      turn++;
    }
    i++;
  }

  io.emit("turn",turn);
}

const restartGame = () => {
  players.forEach(player => {
    player.ready = false;
    player.turnDone = false;
    player.votes = 0;
    player.alive = true;
  });
  io.emit("players",players);
  io.emit("mrWhite", false);
  io.emit("word","");
  io.emit("lobby");
  votesDone = 0;
  deads = 0;
  gameState = 0
}

io.on("connection", socket => {
  socket.on("newPlayer", name => addPlayer(socket,name));
  socket.on("giveVote", votes => giveVote(votes));
  socket.on("nextTurn", () => nextTurn(socket));
  socket.on("newReady", ready => setReady(socket,ready));
  socket.on("addPlayer", data => addTotalPlayer(socket,data));
  socket.on("disconnect", () => removePlayer(socket));
});

server.listen(port, () => console.log(`Listening on port ${port}`));