// gracefully handle players leaving room
// potential improvement: only broadcast back client who sent can send to itself, cf
// https://stackoverflow.com/questions/26324169/can-the-socket-io-client-emit-events-locally

// - gameInfo should be objects with methods!!! ridiculous
// - are all messages properly formatted? (with timestamps etc)

var PORT = process.env.PORT || 3000; // take port from heroku or for loacalhost
var express = require("express");
var app = express(); // express app which is used boilerplate for HTTP
var http = require("http").Server(app);

const common = require('./public/js/common.js');
const help = require('./public/js/help.js');

//moment js
var moment = require("moment");

var clientInfo = {}; // keys = socket ids
var gameInfo = {}; // keys = room names
var gameCards = {}; // keys = room names

//socket io module
var io = require("socket.io")(http);

// expose the folder via express thought
app.use(express.static(__dirname + '/public'));

// send current users to provided socket
function sendCurrentUsers(socket) { // loading current users
    var info = clientInfo[socket.id];
    var users = [];
    if (typeof info === 'undefined') {
	return;
    }
    // filter name based on rooms
    Object.keys(clientInfo).forEach(function(socketId) {
	var userinfo = clientInfo[socketId];
	// check if user room and selcted room same or not
	// as user should see names in only his chat room
	if (info.room == userinfo.room) {
	    users.push(userinfo.name);
	}

    });
    // emit message when all users list

    socket.emit("message", {
	name: "System",
	arg: "Current Users : " + users.join(', '),
	timestamp: moment().valueOf()
    });

}


// general purpose
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}


// io.on listens for events
io.on("connection", function(socket) {
    console.log("User "+socket.id+" is connected");

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

    // for private chat
    socket.on('joinRoom', function(req) {
	var room=req.room;
	clientInfo[socket.id] = req;
	socket.join(room);
	//broadcast new user joined room
	socket.broadcast.to(room).emit("message", {
	    name: "Broadcast",
	    arg: req.name + ' has joined',
	    timestamp: moment().valueOf()
	});
	if (gameInfo[room]!==undefined) { // game already started
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
	socket.broadcast.to(clientInfo[socket.id].room).emit("typing", message);
    });

    // to check if user seen Message
    socket.on("userSeen", function(msg) {
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
	console.log("Message Received : " + message.arg);
	io.in(clientInfo[socket.id].room).emit("message", message);
    });

    socket.on("users", function() {
	sendCurrentUsers(socket); // to show all current users
    });

    socket.on("help", function() {
	socket.emit("message", {
	    arg: help.helpText,
	    timestamp: moment().valueOf(),
	    name: "System"
	});
    });

    socket.on("ready", function(flag) { // client says ready to start game (or not)
	var room = clientInfo[socket.id].room;
	if (gameInfo[room]!==undefined) { // game already started
		socket.emit("message", {
		    name: "System",
		    arg: "Game already started.",
		    timestamp: moment().valueOf()
		});
	} else {
	    if (clientInfo[socket.id].ready==(flag!==false)) return;
	    clientInfo[socket.id].ready=(flag!==false);
	    var room=clientInfo[socket.id].room;
	    io.in(room).emit("message", {
		name: "Broadcast",
		arg: clientInfo[socket.id].name+" ready: "+clientInfo[socket.id].ready,
		timestamp: moment().valueOf()
	    });
	}
	// check if required number of players
	var people=Object.keys(io.sockets.adapter.rooms[room].sockets);
	var n=0;
	for (var i=0; i<people.length; i++)
	    if (clientInfo[people[i]].ready) n++;
	if (n==4) startGame(room);
    });

    socket.on("bid", function(message) { // arg should be [bid,suit] where bid = number or "pass"
	var name = clientInfo[socket.id].name; // should be same as message.name
	var room = clientInfo[socket.id].room;
	if (typeof gameInfo[room] === "undefined") return;
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
	var name = clientInfo[socket.id].name; // should be same as message.name
	var room = clientInfo[socket.id].room;
	if (typeof gameInfo[room] === "undefined") return;
	if (common.process_play(gameInfo[room],gameCards[room][gameInfo[room].turn],message)) {
	    io.in(room).emit("play", message);
	    // lots of messaging to do
	    io.in(room).emit("message", {
		name: "Broadcast",
		arg: name+" plays "+common.cardshtml[message.arg]+"<br/>" // what about old syntax? TODO
		    +gameInfo[room].playerNames[gameInfo[room].turn]+"'s turn",
		timestamp: moment().valueOf()
	    });
	    if (Math.max(...gameInfo[room].numcards)==0) { // end of round
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
});

http.listen(PORT, function() {
    console.log("server started");
});


function startGame(room) {
    console.log("Game starting in room "+room);
    gameInfo[room]={}; gameCards[room]=new Array(4);
    var people=Object.keys(io.sockets.adapter.rooms[room].sockets);
    var players=[];    // not stored in gameInfo because may change with time (reconnects)
    var n=0;
    for (var i=0; i<people.length; i++)
	if (clientInfo[people[i]].ready) {
	    n++;
	    players.push(people[i]);
	}
    if (n!=4) return -1; // wrong number of players

    // also issue of ordering! TODO

    gameInfo[room].playerNames=players.map(p=>clientInfo[p].name); // names shouldn't change (not very secure...)
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
    console.log("Round starting in room "+room);
    var people=Object.keys(io.sockets.adapter.rooms[room].sockets);
    var players=new Array(4);    // not stored in gameInfo because may change with time (reconnects)
    var i,j;
    for (i=0; i<people.length; i++)
    {
	j=0;
	while ((j<4)&&(clientInfo[people[i]].name!=gameInfo[room].playerNames[j])) j++;
	if (j<4)
	    players[j]=people[i];
    }

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

    
    gameInfo[room].numcards=[8,8,8,8];
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
    for (i=0; i<4; i++)
	io.to(players[i]).emit("hand", gameCards[room][i]);

    io.in(room).emit("gameInfo", gameInfo[room]); // send all the public info to clients

}
