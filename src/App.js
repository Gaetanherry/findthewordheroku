import React, { Component } from "react";
import socketIOClient from "socket.io-client";

import "@fortawesome/fontawesome-free/css/all.css";
import "./App.css";

var socket;

class App extends Component {
  constructor() {
    super();
    this.state = {
      response: false,
      nbPlayers : 0,
      totalPlayers : 0,
      endpoint: "http://127.0.0.1:4001"
    };
    socket=socketIOClient(this.state.endpoint);
  }

  componentDidMount() {
    socket.emit("newPlayer");
    socket.on("nbPlayers", data => this.setState({ nbPlayers: data }));
    socket.on("totalPlayers", data => this.setState({ totalPlayers: data }));
  }

  addPlayer(num) {
    socket.emit("addPlayer",num);
  }

  render() {
    const { response } = this.state;
    return (
        <div id="container">
          <h1>Trouve le mot, ou Mr. White !</h1>
          <p>Nombre de Joueurs : {this.state.nbPlayers} / {this.state.totalPlayers} 
          <button className="buttonDiv" onClick={() => this.addPlayer(1)}><i className="fas fa-plus fa-1x"></i></button> 
          <button className="buttonDiv" onClick={() => this.addPlayer(-1)}><i className="fas fa-minus fa-1x"></i></button></p>
          
          {response
              ? <p>
                The current time is : {response}
              </p>
              : <p>Loading...</p>}
        </div>
    );
  }
}

export default App;