import React, { Component } from "react";
import socketIOClient from "socket.io-client";

import "@fortawesome/fontawesome-free/css/all.css";
import "./App.css";

var socket;

class App extends Component {
  constructor() {
    super();
    let port = process.env.PORT || 3000;
    this.state = {
      isReady: false,
      ready : [],
      registered: false,
      players: [],
      totalPlayers: 0,
      endpoint: "http://127.0.0.1:"+port,
      name: "",
      gameState: 0,// 0: setting players 1: saying words 2: voting 3: vote results
      mrWhite: false,
      word: "",
      death: "",
      turn: 0,
      turnDone: [],
      alive: [],
      vote: -1,
      playersVotes: [],
      whiteDead: false,
      whiteWon: false,
      disconnected: []
    };
    socket=socketIOClient(this.state.endpoint);
  }

  componentDidMount() {
    socket.on("registered", () => this.setState({ registered : true }));
    socket.on("disconnected", data => this.setState({ disconnected : data}));
    socket.on("lobby", () => this.setState({ gameState : 0, isReady : false }));
    socket.on("mrWhiteWon", () => this.setState({ whiteWon : true }));
    socket.on("mrWhiteDead", () => this.setState({ whiteDead : true }));
    socket.on("voteState", () => this.setState({ gameState : 2, vote : this.state.players.length }));
    socket.on("playersVotes", data => this.setState({ playersVotes : data }));
    socket.on("alive", data => this.oneDeath(data));
    socket.on("turnDone", data => this.setState({ turnDone : data }));
    socket.on("turn", data => this.setState({ gameState : 1, turn : data }));
    socket.on("word", data => this.setState({ word : data }));
    socket.on("mrWhite", bool => this.setState({ mrWhite : bool, whiteDead : false, whiteWon : false }));
    socket.on("newGame", () => this.setState({ gameState : 1 }));
    socket.on("ready", data => this.setState({ ready : data }));
    socket.on("players", data => this.setState({ players : data }));
    socket.on("totalPlayers", data => this.setState({ totalPlayers: data }));
  }

  oneDeath(aliveData) {
    if(aliveData.reduce(function(acc,curr) { // si c'est un reset des alive
      return acc && curr;
    })) {
      this.setState({ alive : aliveData });
    } else {
      let index = 0;
      while(this.state.alive[index] === aliveData[index]) {
        index++;
      }
      this.setState({ death : this.state.players[index], gameState : 3, alive : aliveData });
    }
  }

  addPlayer(num) {
    socket.emit("addPlayer",num);
  }

  play() {
    if(this.state.name !== "") {
      socket.emit("newPlayer",this.state.name);
    }
  }

  putReady() {
    if (!this.state.isReady) {
      this.setState({ isReady : true });
      socket.emit("newReady", true);
    } else {
      this.setState({ isReady : false });
      socket.emit("newReady", false);
    }
  }

  turnFinished() {
    socket.emit("nextTurn");
  }

  giveVote(i) {
    socket.emit("giveVote",[this.state.vote,i]);
    this.setState({ vote : i });
  }

  render() {
    let dPlayers = [];
    this.state.disconnected.forEach((item,i) => {
      item && dPlayers.push(this.state.players[i]);
    });
    return (
        
        <div id="container">
          <h1>Trouve le mot, ou Mr. White !</h1>

          {this.state.gameState === 0 ? // Setup des joueurs
            <>
            {this.state.registered ?
              <>
              {this.state.totalPlayers === 0 ? // Le serveur a pris en compte la connection
                <p>Serveur injoignable</p>
                :
                <>
                <p>Nombre de Joueurs : {this.state.players.length} / {this.state.totalPlayers} 
                <button className="buttonDiv" onClick={() => this.addPlayer(1)}><i className="fas fa-plus fa-1x"></i></button> 
                <button className="buttonDiv" onClick={() => this.addPlayer(-1)}><i className="fas fa-minus fa-1x"></i></button></p>

                <div id="tableDiv">
                <table>
                  <th><td>Joueurs</td></th>
                  {
                    this.state.players.map((player,i) => {
                    return<tr><td>{player} {this.state.ready[i] && <i className="fas fa-check fa-1x"></i>}</td></tr>;
                    })
                  }
                </table>
                </div>
                <button className="playButton" id="readyButton" onClick={() => this.putReady()}> Prêt </button>
                </>
              }
              </>
            :
              <p>Entre ton pseudo :  <input value={this.state.name} onChange={evt => this.setState({ name : evt.target.value})}/>
              <button className="playButton" onClick={() => this.play()}>Jouer</button></p>
            }
            </>
          : // Jeu a débuté
            <>
            {this.state.registered ?
              <>
              {this.state.mrWhite ?
                <p>Vous êtes Mr. White ! Vous devez deviner le mot que tout le monde a.</p>
                :
                <p>Votre mot : <b>{this.state.word}</b>.<br />
                Vous devrez trouver des mots similaires mais pas trop, pour montrer aux autres que vous connaissez le mot,<br/>
                tout en empêchant Mr. White, qui n'a aucun mot, de le deviner !</p>
              }
              {this.state.disconnected.length > 0 && this.state.disconnected.reduce(function(acc,curr) { // s'il y a un déconnecté
                                        return acc || curr;
                                      }) ?
                <>
                <p>En attente de reconnexion de(s) joueur(s) :</p>
                {dPlayers.map(item => {
                    return <p>{item}</p>;
                })}
                </>
              :
                <>
                {this.state.gameState === 1 ?
                <>
                <div id="tableDiv">
                <table>
                  <th><td>Joueurs</td></th>
                  {
                    this.state.players.map((player,i) => {
                    return<tr><td>{this.state.alive[i] ? <>{this.state.turnDone[i] ? <i>{player}</i> : <>{player}</>}</> : <del>{player}</del> } {this.state.turn === i && <i className="fas fa-arrow-left fa-1x"></i>}</td></tr>;
                    })
                  }
                </table>
                </div>
                <p>Au tour de {this.state.players[this.state.turn]} de donner son mot !</p>

                {this.state.players[this.state.turn] === this.state.name && //c'est ton tour
                  <>
                  <br/><button className="playButton" onClick={() => this.turnFinished()}>Mot donné</button>
                  </>
                }
                </>
                : // tour des votes
                <>
                  {this.state.gameState === 2 ?
                  <>
                  <div id="tableDiv">
                  <table>
                    <th><td>Joueurs</td></th>
                    {
                      this.state.players.map((player,i) => {
                      return<tr><td>{this.state.alive[i] ? <button className="playButton" onClick={() => this.giveVote(i)}>{player}</button> : <del>{player}</del>} {this.state.playersVotes[i]} Votes</td></tr>;
                      })
                    }
                  </table>
                  </div>
                  <p>Votez pour le joueur qui est Mr. White, il sera éliminé ! <br/>
                  Le vote se termine dès que tout le monde a un vote et qu'il y a une majorité.</p>
                  </>
                  : // élimination
                  <>
                  <p><b>{this.state.death}</b> est éliminé(e) ! <br/></p>
                  {this.state.whiteDead ?
                    <p>Mr White est éliminé ! Partie terminée.<br />
                    Mr White a une tentative pour trouver le mot, s'il le trouve il gagne !</p>
                  :
                  <>{this.state.whiteWon ?
                    <p>Mr White a fait une victoire parfaite ! Partie terminée.</p>
                    :
                    <p>Ce n'était pas Mr White ! La partie continue.</p>
                    }</>
                  }
                  </>
                  }
                </>
                }
              </>
              }
              </>
              :
              <>
              <p>Ne bougez pas! Une partie est en cours, vous rejoindrez dès qu'elle se termine.</p>
              {this.state.disconnected.length > 0 && this.state.disconnected.reduce(function(acc,curr) { // s'il y a un déconnecté
                                        return acc || curr;
                                      }) &&
              <p>Si vous avez été déconnecté, reconnectez vous avec le pseudo exact.</p>
              }
              </>
            }
            </>
          }
        </div>
    );
  }
}

export default App;