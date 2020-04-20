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

/* interface player {
  name : String;
  socket : String;
  ready : Boolean;
  alive : Boolean;
  turnDone : Boolean;
  votes : Number;
  disconnected : Boolean;
} */

let players = [], playersSockets = [], ready = [], alive=[], turnDone=[], playersVotes=[], disconnected=[];
let totalPlayers = 0, gameState = 0, mrWhite = 0, turn = 0, deads = 0;
let word = "";
const wordlength = 503;

const nthline = require('nthline'), filePath = './src/server/words.txt';

function findWord() {
  let rowNumber = Math.floor(Math.random() * wordlength) +1;
  nthline(rowNumber, filePath).then(line => {
    word = line;
    playersSockets.forEach( (socket,i) => {
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
  playersSockets = [];
  ready = []; 
  alive=[]; 
  turnDone=[]; 
  playersVotes=[];
  disconnected=[];
  totalPlayers = 0;
  gameState = 0;
  mrWhite = 0;
  turn = 0;
  deads = 0;
  word = "";
}

const addPlayer = (socket,name) => {
  let i = players.indexOf(name);
  if (gameState === 0) {
    players.push(name);
    playersSockets.push(socket);
    ready.push(false);
    console.log("New Player "+name+" connected.");
    socket.emit("registered");
    io.emit("players", players);

    if (players.length>totalPlayers) {
      addTotalPlayer(socket, players.length-totalPlayers);
    } else {
      socket.emit("totalPlayers",totalPlayers);
    }
  } else if(disconnected[i]){
    disconnected[i] = false;
    playersSockets[i] = socket;
    console.log("Player "+players[i]+" reconnected.");
    socket.emit("registered");
    socket.emit("disconnected",disconnected);
    socket.emit("players",players);
    socket.emit("totalPlayers",totalPlayers);
    socket.emit("turn",turn);
    socket.emit("turnDone",turnDone);
    socket.emit("alive",alive);
    if (i === mrWhite) {
      socket.emit("mrWhite", true);
    } else {
      socket.emit("mrWhite", false);
      socket.emit("word",word);
    }
    if (gameState === 2) {
      socket.emit("voteState");
      socket.emit("playersVotes",playersVotes);
    }
    io.emit("disconnected",disconnected);
  } else {
    socket.emit("newGame"); // gamestate 1
  }
}

const removePlayer = socket => {
  var i = playersSockets.indexOf(socket);
    if (i !== -1) {
      console.log("Player "+players[i]+" disconnected");
      if (gameState === 0) {
        playersSockets.splice(i, 1);  
        players.splice(i, 1);
        ready.splice(i, 1);

        io.emit("players", players);
      } else {
        disconnected[i]=true;
        io.emit("disconnected",disconnected);

        if(disconnected[i].reduce(function(acc,curr) { // si tout le monde est déco
          return acc && curr;
        })) {
          resetGame();
        }
      }
  }
}

const addTotalPlayer = (socket, nb) => {
  totalPlayers+=nb;

  if (totalPlayers < players.length) { 
    totalPlayers = players.length; 
  }

  io.emit("totalPlayers",totalPlayers);
}

const setReady = (socket,readyBool) => {
  var i = playersSockets.indexOf(socket);  
  ready[i] = readyBool;
  io.emit("ready",ready);

  if (ready.reduce(function(acc,curr) { // si tout le monde ready et si on est plus de 2
    return acc && curr;
  }) && players.length > 2 && players.length === totalPlayers) {
    gameState = 1;
    newGame();
  };
}

const newGame = () => {
  mrWhite = Math.floor(Math.random() * players.length);
  findWord();

  turnDone = players.map(player => {
    return false;
  });
  alive = players.map(player => {
    return true;
  });
  disconnected = players.map(player => {
    return false;
  });
  io.emit("turnDone", turnDone);
  io.emit("alive", alive);
  io.emit("disconnected",disconnected);
  turn = Math.floor(Math.random() * players.length);
  if(turn === mrWhite) {turn = Math.floor(Math.random() * players.length)}; // Mr White 2x moins de chance d'etre premier
  io.emit("turn",turn);
  io.emit("newGame");
}

const nextTurn = () => {
  turnDone[turn] = true;
  io.emit("turnDone", turnDone);
  if (turnDone.reduce(function(acc,curr,i) { // si tout le monde a fait son tour
    if (i === 1) {
      return (acc || !alive[0]) && (curr || !alive[1]);
    }
    return acc && (curr || !alive[i]);
  })) {
    gameState = 2;
    playersVotes = players.map( player => {
      return 0;
    })
    playersVotes.push(0);
    io.emit("playersVotes", playersVotes);
    io.emit("voteState");
  } else { // il reste un tour à jouer au moins
    turn++;
    if (turn === players.length) {
      turn = 0;
    }

    while (!alive[turn]) {
      turn++;
      if (turn === players.length) {
        turn = 0;
      }
    }
    io.emit("turn",turn);
  }
}

const giveVote = votes => {
  playersVotes[votes[0]]--;
  playersVotes[votes[1]]++;
  io.emit("playersVotes", playersVotes);

  if(playersVotes[players.length] === -(players.length - deads)) { //tout le monde a voté
    let isMajority = true, index = 0;
    playersVotes.reduce(function(acc,curr,i) { // s'il y a une majorité unique
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
      alive[index]= false;
      deads++;
      io.emit("alive",alive);
      if (index == mrWhite) {
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
  turnDone = players.map(player => {
    return false;
  });
  playersVotes = playersVotes.map(player => {
    return 0;
  });
  io.emit("turnDone", turnDone);
  io.emit("playersVotes", playersVotes);
  turn = Math.floor(Math.random() * (players.length - deads));

  let i=0;
  while(i<=turn) {
    if (!alive[i]) {
      turn++;
    }
    i++;
  }

  io.emit("turn",turn);
}

const restartGame = () => {
  ready = ready.map(rdy => {
    return false;
  });
  turnDone = players.map(player => {
    return false;
  });
  playersVotes = playersVotes.map(player => {
    return 0;
  });
  alive = alive.map(player => {
    return true;
  })
  io.emit("alive",alive);
  io.emit("turnDone", turnDone);
  io.emit("playersVotes", playersVotes);
  io.emit("ready",ready);
  io.emit("mrWhite", false);
  io.emit("word","");
  io.emit("lobby");
  deads = 0;
  gameState = 0
}

io.on("connection", socket => {
  socket.on("giveVote", votes => giveVote(votes));
  socket.on("nextTurn", () => nextTurn(socket));
  socket.on("newReady", ready => setReady(socket,ready));
  socket.on("newPlayer", name => addPlayer(socket,name));
  socket.on("addPlayer", data => addTotalPlayer(socket,data));
  socket.on("disconnect", () => removePlayer(socket));
});

server.listen(port, () => console.log(`Listening on port ${port}`));