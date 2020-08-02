// - gracefully handle players leaving room
// in particular should game end if all players leave?
// right now ready is *not* preserved by reloading page
// - potential improvement: only broadcast back client who sent can send to itself, cf
// https://stackoverflow.com/questions/26324169/can-the-socket-io-client-emit-events-locally
// - gameInfo should be objects with methods

const express = require("express");
const app = express(); // express app which is used boilerplate for HTTP
const http = require("http").Server(app);
const moment = require("moment"); // for timestamps
//socket io module
var io = require("socket.io")(http);

const PORT = process.env.PORT || 3000;

const common = require('./public/js/common.js');
const help = require('./public/js/help.js');

var clientInfo = {}; // keys = socket ids
var gameInfo = {};   // public game info. keys = room names
var gameCards = {};  // private game info. keys = room names

// logging
const winston = require("winston");
const loggerSettings = {
    transports: [new winston.transports.Console()],
    format: winston.format.combine(
	winston.format.timestamp({format:'YYYY-MM-DD HH:mm:ss'}),
	winston.format.printf(info => `${info.timestamp} [${info.level}] ${info.message}`)
    )
};
const logger = winston.createLogger(loggerSettings);
const expressWinston = require("express-winston");
//app.use(expressWinston.logger(loggerSettings));
app.use(expressWinston.logger({winstonInstance: logger}));

// expose the folder via express thought
app.use(express.static(__dirname + '/public'));

// general purpose
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}


// io.on listens for events
io.on("connection", function(socket) {
    logger.info("User "+socket.id+" is connected");

    //for disconnection
    socket.on("disconnect", function() {
	var userdata = clientInfo[socket.id];
	if (userdata !== undefined) {
	    socket.leave(userdata.room); // leave the room
	    //broadcast leave room to only members of same room
	    socket.broadcast.to(userdata.room).emit("message", {
		arg: userdata.name + " has left",
		name: "Broadcast",
		timestamp: moment().valueOf()
	    });

	    // delete user data-
	    delete clientInfo[socket.id];

	}
    });

    // when entering a room
    socket.on('joinRoom', function(req) {
	var room=req.room;
	// check that user's name not already taken but only give warning
	if (typeof io.sockets.adapter.rooms[room] !== "undefined") {
	    var people = Object.keys(io.sockets.adapter.rooms[room].sockets);
	    var names = people.map( id => clientInfo[id].name );
	    if (names.indexOf(req.name)>=0)
		io.in(room).emit("message", {
		    name: "Broadcast",
		    arg: "Warning: multiple logins of "+req.name,
		    timestamp: moment().valueOf()
		});
	}
	socket.join(room);
	clientInfo[socket.id] = req;
	// broadcast new user joined room
	socket.broadcast.to(room).emit("message", {
	    name: "Broadcast",
	    arg: req.name + ' has joined',
	    timestamp: moment().valueOf()
	});
	if ((typeof gameInfo[room] !== "undefined")&&(gameInfo[room].started)) { // game already started
	    var i=gameInfo[room].playerNames.indexOf(req.name);
	    if (i>=0) {
		socket.emit("hand", gameCards[room][i]);
	    }
	    else {		
		socket.emit("message", {
		    name: "System",
		    arg: "Game already started. You're a spectator",
		    timestamp: moment().valueOf()
		});
	    }
	    socket.emit("gameInfo",gameInfo[room]);
	}
    });

    // to show who is typing Message

    socket.on('typing', function(message) { // broadcast this message to all users in that room
	if (!clientInfo[socket.id]) return;
	socket.broadcast.to(clientInfo[socket.id].room).emit("typing", message);
    });

    // to check if user seen Message
    socket.on("userSeen", function(msg) {
	if (!clientInfo[socket.id]) return;
	socket.broadcast.to(clientInfo[socket.id].room).emit("userSeen", msg);
	//socket.emit("message", msg);

    });

    socket.emit("message", {
	arg: help.welcomeText,
	timestamp: moment().valueOf(),
	name: "System"
    });

    // listen for client message
    socket.on("message", function(message) {
	if (!clientInfo[socket.id]) return;
	logger.info("Message Received : " + message.arg);
	io.in(clientInfo[socket.id].room).emit("message", message);
    });

    // list users in room
    socket.on("users", function() {
	if (!clientInfo[socket.id]) return;
	var info = clientInfo[socket.id];
	var people = Object.keys(io.sockets.adapter.rooms[info.room].sockets);
	var names = people.map( id => clientInfo[id].name );
	socket.emit("message", {
	    name: "System",
	    arg: "Current users : " + names.join(', '),
	    timestamp: moment().valueOf()
	});
    });

    socket.on("help", function() {
	socket.emit("message", {
	    arg: help.helpText,
	    timestamp: moment().valueOf(),
	    name: "System"
	});
    });

    socket.on("ready", function(message) { // client says ready to start game (or not) OR wants to end game
	if (!clientInfo[socket.id]) return;
	var room = clientInfo[socket.id].room;
	var name = clientInfo[socket.id].name;
	var flag = (message.arg!==false)&&(message.arg!="false")&&(message.arg!="off");

	if (typeof gameInfo[room] === "undefined") gameInfo[room]={};
	if (typeof gameInfo[room].readyPlayerNames === "undefined") gameInfo[room].readyPlayerNames=[]; // list of ready player names
	var i = gameInfo[room].readyPlayerNames.indexOf(name);
	if ((i>=0)==flag) return; // no change in ready status

	if (flag) gameInfo[room].readyPlayerNames.push(name);
	else gameInfo[room].readyPlayerNames.splice(i,1);
	var msg=name;
	if (gameInfo[room].started) // game already started
	    msg += (flag ? " no longer" : "") +" wants to end the game";
	else
	    msg += flag ? " is ready" : " is not ready";
	io.in(room).emit("message", {
	    name: "Broadcast",
	    arg: msg,
	    timestamp: moment().valueOf()
	});
	// check if required number of players
	if (!gameInfo[room].started&&(gameInfo[room].readyPlayerNames.length == 4))
	    startGame(room);
	else if (gameInfo[room].started&&(gameInfo[room].readyPlayerNames.length == 0))
	    endGame(room);
    });
    socket.on("partner", function(message) {
	if (!clientInfo[socket.id]) return;
	var room = clientInfo[socket.id].room;
	var name = clientInfo[socket.id].name;
	if ((typeof gameInfo[room] !== "undefined")&&(gameInfo[room].started)) { // game already started
		socket.emit("message", {
		    name: "System",
		    arg: "Game already started.",
		    timestamp: moment().valueOf()
		});
	} else {
	    if (typeof gameInfo[room] === "undefined") gameInfo[room]={};
	    gameInfo[room].partners = [name,message.arg]; // only a single partner request is stored
	    io.in(room).emit("message", {
		name: "Broadcast",
		arg: name+" wants to partner with "+message.arg,
		timestamp: moment().valueOf()
	    });
	}
    });

    socket.on("bid", function(message) { // arg should be [bid,suit] where bid = number or "pass"
	if (!clientInfo[socket.id]) return;
	var name = clientInfo[socket.id].name; // should be same as message.name
	var room = clientInfo[socket.id].room;
	if ((typeof gameInfo[room] === "undefined")||(!gameInfo[room].started))  return;
	if (common.process_bid(gameInfo[room],message)) {
	    io.in(room).emit("bid", message);
	    if (gameInfo[room].bidPasses==4) { // nobody bid
		io.in(room).emit("message", {
		    name: "Broadcast",
		    arg: "Everyone passed",
		    timestamp: moment().valueOf()
		});
		gameInfo[room].deck=gameCards[room][0].concat(gameCards[room][1],gameCards[room][2],gameCards[room][3]); // reform the deck
		setTimeout(startRound,2500,room);
	    }
	    else {
		var msg;
		if (message.arg=="pass") msg=" passes<br/>";
		else if (message.arg=="coinche")
		    if (gameInfo[room].surcoinche) msg=" surcoinches<br/>"; else msg=" coinches<br/>";
		else msg=" bids "+gameInfo[room].bid+" "+common.suitshtml[gameInfo[room].trump]+"<br/>";
		if (gameInfo[room].playing) msg+="Game starts<br/>";
		io.in(room).emit("message", {
		    name: "Broadcast",
		    arg: name + msg
			+gameInfo[room].playerNames[gameInfo[room].turn]+"'s turn",
		    timestamp: moment().valueOf()
		});
	    }
	}
    });

    socket.on("play", function(message) { //	
	if (!clientInfo[socket.id]) return;
	var name = clientInfo[socket.id].name; // should be same as message.name
	var room = clientInfo[socket.id].room;
	if ((typeof gameInfo[room]==="undefined")||(!gameInfo[room].started))  return;
	if (common.process_play(gameInfo[room],gameCards[room][gameInfo[room].turn],message)) {
	    io.in(room).emit("play", message);
	    // lots of messaging to do
	    io.in(room).emit("message", {
		name: "Broadcast",
		arg: name+" plays "+common.cardshtml[message.arg]+"<br/>" // what about old syntax? TODO
		    +gameInfo[room].playerNames[gameInfo[room].turn]+"'s turn",
		timestamp: moment().valueOf()
	    });
	    if (Math.max(...gameInfo[room].numCards)==0) { // end of round
		var msg = gameInfo[room].playerNames[0]+"/"+gameInfo[room].playerNames[2]+": "+gameInfo[room].roundScores[0]+" pts<br/>"
		    +gameInfo[room].playerNames[1]+"/"+gameInfo[room].playerNames[3]+": "+gameInfo[room].roundScores[1]+" pts<br/>";
		msg += gameInfo[room].bidSuccess ? "Bid successful<br/>" : "Bid unsuccessful<br/>";
		msg += "Total "+gameInfo[room].playerNames[0]+"/"+gameInfo[room].playerNames[2]+": "+gameInfo[room].totalScores[0]+" pts<br/>"
		    +"Total "+gameInfo[room].playerNames[1]+"/"+gameInfo[room].playerNames[3]+": "+gameInfo[room].totalScores[1]+" pts";
		io.in(room).emit("message", {
		    name: "Broadcast",
		    arg: msg,
		    timestamp: moment().valueOf()
		});
		setTimeout(startRound,5000,room);
	    }
	}
    });
    socket.on("auto", function(message) { // none of our business, send back to user
	if (!clientInfo[socket.id]) return;
	socket.emit("auto",message);
    });
});
http.listen(PORT, function() {
    logger.info("server started");
});


function startGame(room) {
    if ((typeof gameInfo[room] === "undefined")||(gameInfo[room].readyPlayerNames.length != 4)) return -1; // wrong number of players
    gameInfo[room].playerNames=gameInfo[room].readyPlayerNames.slice(); // make a copy
    logger.info("Game starting in room "+room);
    gameInfo[room].started=true;
    gameCards[room]=new Array(4);
    if (typeof gameInfo[room].partners !== "undefined") {
	// find partners
	var i=gameInfo[room].playerNames.indexOf(gameInfo[room].partners[0]);
	var j=gameInfo[room].playerNames.indexOf(gameInfo[room].partners[1]);
	if ((i>=0)&&(j>=0)&&((j%2)!=(i%2))) { // need to swap
	    var tmp = gameInfo[room].playerNames[j];
	    gameInfo[room].playerNames[j]=gameInfo[room].playerNames[(i+2)%4];
	    gameInfo[room].playerNames[(i+2)%4]=tmp;
	}
    }
    io.in(room).emit("message", {
	name: "Broadcast",
	arg: "Game starting! "+gameInfo[room].playerNames.join(),
	timestamp: moment().valueOf()
    });
    gameInfo[room].deck=[...Array(32).keys()];
    shuffleArray(gameInfo[room].deck);
    gameInfo[room].totalScores=[0,0]; gameInfo[room].scores=[];
    // starting player
    gameInfo[room].startingPlayer=Math.floor(Math.random()*4);
    startRound(room);
}

function startRound(room) {
    logger.info("Round starting in room "+room);

    // shuffle cards -- correction, cut!
    var n=Math.floor(Math.random()*26)+3;
    for (i=0; i<n; i++) gameInfo[room].deck.unshift(gameInfo[room].deck.pop());

    // tricks
    gameInfo[room].tricks=[[],[],[],[]];
    
    // deal
    gameCards[room]=[[],[],[],[]];
    var i,j;
    for (i=0; i<4; i++)
	for (j=0; j<3; j++) 
	    gameCards[room][i].push(gameInfo[room].deck.pop());
    for (i=0; i<4; i++)
	for (j=0; j<3; j++) 
    gameCards[room][i].push(gameInfo[room].deck.pop());
    for (i=0; i<4; i++)
	for (j=0; j<2; j++) 
    gameCards[room][i].push(gameInfo[room].deck.pop());
    for (i=0; i<4; i++)
	gameCards[room][i].sort((a, b) => a - b);

    
    gameInfo[room].numCards=[8,8,8,8];
    gameInfo[room].playedCards=[-1,-1,-1,-1];
    gameInfo[room].firstplayedCard=-1;

    gameInfo[room].bidding=true;
    gameInfo[room].trump=-1;
    gameInfo[room].bid=70; gameInfo[room].bidPlayer=-1; gameInfo[room].bidPasses=0;
    gameInfo[room].lastbids=[null,null,null,null];
    gameInfo[room].coinche=gameInfo[room].surcoinche=false;
    gameInfo[room].playing=false;
     
    // starting player
    gameInfo[room].startingPlayer=(gameInfo[room].startingPlayer+1)%4;
    gameInfo[room].turn=gameInfo[room].startingPlayer;

    io.in(room).emit("message", {
	name: "Broadcast",
	arg: "Round starting!<br/>"
	    +gameInfo[room].playerNames[gameInfo[room].turn]+"'s turn",
	timestamp: moment().valueOf()
    });

    // send the private info: hand
    var people = Object.keys(io.sockets.adapter.rooms[room].sockets);
    people.forEach(function(id) {
	i = gameInfo[room].playerNames.indexOf(clientInfo[id].name);
	if (i>=0) io.to(id).emit("hand", gameCards[room][i]);
    });
    io.in(room).emit("gameInfo", gameInfo[room]); // send all the public info to clients
}

function endGame(room) {
    logger.info("Game ending in room "+room);
    gameInfo[room].started=gameInfo[room].playing=gameInfo[room].bidding=false;
    gameInfo[room].playerNames=["","","",""];
    gameInfo[room].tricks=[[],[],[],[]];
    gameCards[room]=[[],[],[],[]];
    gameInfo[room].numCards=[0,0,0,0];
    gameInfo[room].startingPlayer=gameInfo[room].turn=-1;
    // don't erase the scores yet
    io.in(room).emit("message", {
	name: "Broadcast",
	arg: "Game ended",
	timestamp: moment().valueOf()
    });
    // what else? say who won?
    io.in(room).emit("endGame",gameInfo[room]);
}
