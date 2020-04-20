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

let players = []; 
let totalPlayers = 0, gameState = 0, mrWhite = 0, turn = 0, deads = 0, votesDone = 0;
let word = "";
const wordlength = 503;

const nthline = require('nthline'), filePath = './src/server/words.txt';

function findWord() {
  let rowNumber = Math.floor(Math.random() * wordlength) +1;
  nthline(rowNumber, filePath).then(line => {
    word = line;
    players.socket.forEach( (socket,i) => {
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
  totalPlayers = 0;
  gameState = 0;
  mrWhite = 0;
  turn = 0;
  deads = 0;
  votesDone = 0;
  word = "";
}

const addPlayer = (socket,name) => {
  let i = players.name.indexOf(name);
  if (gameState === 0) {
    players.push({
      name : name,
      socket : socket,
      ready : false,
      alive : true,
      turnDone : false,
      votes : 0,
      disconnected : false});
    console.log("New Player "+name+" connected.");
    socket.emit("registered");
    io.emit("players", players);

    if (players.length>totalPlayers) {
      addTotalPlayer(players.length-totalPlayers);
    } else {
      socket.emit("totalPlayers",totalPlayers);
    }
  } else if(players[i].disconnected){
    players[i].disconnected = false;
    players[i].socket = socket;
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
    socket.emit("newGame"); // gamestate 1
  }
}

const removePlayer = socket => {
  var i = players.socket.indexOf(socket);
    if (i !== -1) {
      console.log("Player "+players[i].name+" disconnected");
      if (gameState === 0) {
        players.splice(i, 1);  
        io.emit("players", players);
      } else {
        players[i].disconnected=true;
        io.emit("players", players);

        if(players[i].disconnected.reduce(function(acc,curr) { // si tout le monde est déco
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
}

const setReady = (socket,readyBool) => {
  var i = players.socket.indexOf(socket);  
  players[i].ready = readyBool;
  io.emit("players",players);

  if (players.ready.reduce(function(acc,curr) { // si tout le monde ready et si on est plus de 2
    return acc && curr;
  }) && players.length > 2 && players.length === totalPlayers) {
    gameState = 1;
    newGame();
  };
}

const newGame = () => {
  mrWhite = Math.floor(Math.random() * players.length);
  findWord();

  players.turnDone = players.map(() => {
    return false;
  });
  players.alive = players.map(() => {
    return true;
  });
  players.disconnected = players.map(() => {
    return false;
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
  if (players.turnDone.reduce(function(acc,curr,i) { // si tout le monde de vivant a fait son tour
    if (i === 1) {
      return (acc || !players[0].alive) && (curr || !players[1].alive);
    }
    return acc && (curr || !players[i].alive);
  })) {
    gameState = 2;
    players.votes = players.map( () => {
      return 0;
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
    players.votes.reduce(function(acc,curr,i) { // s'il y a une majorité unique
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
  players.turnDone = players.map(() => {
    return false;
  });
  players.votes = players.map(() => {
    return 0;
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
  players.ready = players.map(() => {
    return false;
  });
  players.turnDone = players.map(() => {
    return false;
  });
  players.votes = players.map(() => {
    return 0;
  });
  players.alive = players.map(() => {
    return true;
  })
  io.emit("players",players);
  io.emit("mrWhite", false);
  io.emit("word","");
  io.emit("lobby");
  votesDone = 0;
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