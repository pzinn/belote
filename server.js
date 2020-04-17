// complete rewrite: in common.js put all the processing of the commands (play and bid)
// potential improvement: only broadcast back client who sent can send to itself

// - gameInfo should be objects with methods!!! ridiculous
// - should timestamps be copied from sender when broadcasting? would make sense
//   then all messages need to be properly formed (arrays etc)

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
	text: "Current Users : " + users.join(', '),
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
		text: userdata.name + " has left",
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
	    text: req.name + ' has joined',
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
		    text: "Game already started. You're a spectator",
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
	text: help.welcomeText,
	timestamp: moment().valueOf(),
	name: "System"
    });

    // listen for client message
    socket.on("message", function(message) {
	console.log("Message Received : " + message.text);
//	message.timestamp = moment().valueOf();
	//broadcast to all users except for sender
	// now message should be only sent to users who are in same room
	socket.broadcast.to(clientInfo[socket.id].room).emit("message", message);
    });

    socket.on("users", function() {
	sendCurrentUsers(socket); // to show all current users
    });

    socket.on("help", function() {
	socket.emit("message", {
	    text: help.helpText,
	    timestamp: moment().valueOf(),
	    name: "System"
	});
    });

    socket.on("ready", function(flag) { // client says ready to start game (or not)
	var room = clientInfo[socket.id].room;
	if (gameInfo[room]!==undefined) { // game already started
		socket.emit("message", {
		    name: "System",
		    text: "Game already started.",
		    timestamp: moment().valueOf()
		});
	} else {
	    if (clientInfo[socket.id].ready==(flag!==false)) return;
	    clientInfo[socket.id].ready=(flag!==false);
	    var room=clientInfo[socket.id].room;
	    io.in(room).emit("message", {
		name: "Broadcast",
		text: clientInfo[socket.id].name+" ready: "+clientInfo[socket.id].ready,
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
	if (common.process_bid(gameInfo[room],message)) {
	    io.in(room).emit("bid", message);
	    if (gameInfo[room].bidpasses==4) { // nobody bid
		io.in(room).emit("message", {
		    name: "Broadcast",
		    text: "Everyone passed",
		    timestamp: moment().valueOf()
		});
		gameInfo.deck=gameCards[room][0].concat(gameCards[room][1],gameCards[room][2],gameCards[room][3]); // reform the deck
		startRound(room);
	    }
	    else {
		var msg;
		if (((typeof message.arg === "string") && (message.arg.toLowerCase()=="pass"))||((typeof message.arg[0] === "string") && (message.arg[0].toLowerCase()=="pass")))
		    msg=" passes<br/>"; else msg=" bids "+gameInfo[room].bid+" "+common.suitshtml[gameInfo[room].trump]+"<br/>";
		if (gameInfo[room].playing) msg+="Game starts<br/>";
		io.in(room).emit("message", {
		    name: "Broadcast",
		    text: name + msg
			+gameInfo[room].playerNames[gameInfo[room].turn]+"'s turn",
		    timestamp: moment().valueOf()
		});
	    }
	}
    });

    socket.on("play", function(message) { //	
	var name = clientInfo[socket.id].name; // should be same as message.name
	var room = clientInfo[socket.id].room;
	if (common.process_play(gameInfo[room],gameCards[room][gameInfo[room].turn],message)) {
	    io.in(room).emit("play", message);
	    // lots of messaging to do
	    io.in(room).emit("message", {
		name: "Broadcast",
		text: name+" plays "+common.cardshtml[message.arg]+"<br/>" // what about old syntax? TODO
		    +gameInfo[room].playerNames[gameInfo[room].turn]+"'s turn",
		timestamp: moment().valueOf()
	    });
	    if (Math.max(...gameInfo[room].numcards)==0) { // end of round
		io.in(room).emit("message", {
		    name: "Broadcast",
		    text: "TEMP end of round msg",
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
	text: "Game starting! "+gameInfo[room].playerNames.join(),
	timestamp: moment().valueOf()
    });
    gameInfo[room].deck=[...Array(32).keys()];
    shuffleArray(gameInfo[room].deck);
    gameInfo[room].scores=[0,0];
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
    gameInfo[room].bid=70; gameInfo[room].bidplayer=-1; gameInfo[room].bidpasses=0;
    gameInfo[room].lastbids=[null,null,null,null];
    gameInfo[room].playing=false;
     
    // starting player
    gameInfo[room].startingPlayer=(gameInfo[room].startingPlayer+1)%4;
    gameInfo[room].turn=gameInfo[room].startingPlayer;

    io.in(room).emit("message", {
	name: "Broadcast",
	text: "Round starting!<br/>"
	    +gameInfo[room].playerNames[gameInfo[room].turn]+"'s turn",
	timestamp: moment().valueOf()
    });

    // send the private info: hand
    for (i=0; i<4; i++)
	io.to(players[i]).emit("hand", gameCards[room][i]);

    io.in(room).emit("gameInfo", gameInfo[room]); // send all the public info to clients

}
