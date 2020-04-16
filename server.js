// - gameInfo should be objects with methods!!! ridiculous
// - should timestamps be copied from sender when broadcasting? would make sense
//   then all messages need to be properly formed (arrays etc)

var PORT = process.env.PORT || 3000; // take port from heroku or for loacalhost
var express = require("express");
var app = express(); // express app which is used boilerplate for HTTP
var http = require("http").Server(app);

const common = require('./public/js/common.js');

//moment js
var moment = require("moment");

var clientInfo = {}; // keys = socket ids
var gameInfo = {}; // keys = room names
var gameCards = {}; // keys = room names
var helpText = "Help coming soon"; // TODO (maybe put in separate file)

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
		// TODO: show something
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
	text: "Welcome to Belote!",
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

    socket.on("players", function() {
	// TODO show if game started, players
    });

    socket.on("help", function() {
	socket.emit("message", {
	    text: helpText,
	    timestamp: moment().valueOf(),
	    name: "System"
	});
    });

    socket.on("ready", function(flag) { // client says ready to start game (or not)
	if (gameInfo[room]!==undefined) { // game already started
		socket.emit("message", {
		    name: "System",
		    text: "Game already started. You're a spectator",
		    timestamp: moment().valueOf()
		});
	} else {
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
	if (!gameInfo[room].bidding) return -1; // not bidding
	var i = gameInfo[room].playerNames.indexOf(name); // player number
	if (i != gameInfo[room].turn) return -1; // playing out of turn
	if (((typeof message.arg === "string") && (message.arg.toLowerCase()=="pass"))||((typeof message.arg[0] === "string") && (message.arg[0].toLowerCase()=="pass"))) {
	    gameInfo[room].lastbids[i]="pass"; // logging bids
	    gameInfo[room].bidpasses++;
	    gameInfo[room].turn=(gameInfo[room].turn+1)%4;
	    io.in(room).emit("message", {
		name: "Broadcast",
		text: name+" passes"+"<br/>"
		    +gameInfo[room].playerNames[gameInfo[room].turn]+"'s turn",
		timestamp: moment().valueOf()
	    });
	    if (gameInfo[room].bidpasses==4) { // nobody bid
		io.in(room).emit("message", {
		    name: "Broadcast",
		    text: "Everyone passed",
		    timestamp: moment().valueOf()
		});
		gameInfo[room].deck=gameCards[room][0].concat(gameCards[room][1],gameCards[room][2],gameCards[room][3]); // reform the deck
	      startRound(room);
	      return;
	    } else if ((gameInfo[room].bidpasses==3)&&(gameInfo[room].bidplayer>=0)) {
	      io.in(room).emit("message", {
		  name: "Broadcast",
		  text: "Bid is "+gameInfo[room].bid+" "+common.suitshtml[gameInfo[room].trump]+" ("+gameInfo[room].playerNames[gameInfo[room].bidplayer]+"), game starts",
		  timestamp: moment().valueOf()
	      });
		gameInfo[room].bidding=false;
		gameInfo[room].playing=true;
		gameInfo[room].turn=gameInfo[room].startingPlayer;
	    }
	} else {
	    if ((message.arg[0]!="all")&&((message.arg[0]<gameInfo[room].bid)||(gameInfo[room].bid=="all")||(message.arg[0]%10!=0)||(message.arg[0]>160))) return -1; // shouldn't happen
	    gameInfo[room].lastbids[i]=message.arg; // logging bids
	    gameInfo[room].bid=message.arg[0];
	    gameInfo[room].trump= typeof message.arg[1] === "string" ? common.suitshtml0.indexOf(message.arg[1]) : message.arg[1];
	    gameInfo[room].bidplayer = gameInfo[room].turn;
	    gameInfo[room].bidpasses=0;
	    gameInfo[room].turn=(gameInfo[room].turn+1)%4;
	    io.in(room).emit("message", {
		name: "Broadcast",
		text: name+" bids "+gameInfo[room].bid+" "+common.suitshtml[gameInfo[room].trump]+"<br/>"
		    +gameInfo[room].playerNames[gameInfo[room].turn]+"'s turn",
		timestamp: moment().valueOf()
	    });
	}
	io.in(room).emit("gameInfo",gameInfo[room]);// resend all the info; is that a bit much?
	
    });

    socket.on("play", function(message) { //	
	var name = clientInfo[socket.id].name; // should be same as message.name
	var room = clientInfo[socket.id].room;
	if (!gameInfo[room].playing) return -1; // not playing yet
	var i = gameInfo[room].playerNames.indexOf(name); // player number
	if (i != gameInfo[room].turn) return -1; // playing out of turn
	var j = message.arg; // played card
	var k = gameCards[room][i].indexOf(j);
	if (k<0) return -1; // card not in hand
	if (!common.validCard(gameInfo[room].playedCards,gameInfo[room].firstplayedCard,gameCards[room][i],gameInfo[room].trump,j)) return -1;

	// remove card from hand
	gameCards[room][i].splice(k,1);
	gameInfo[room].numcards[i]--;
	gameInfo[room].playedCards[i]=j;
	
	// process the actual play: TODO
	if (gameInfo[room].firstplayedCard<0) { // first player determines suit
	    gameInfo[room].firstplayedCard=j;
	}
	if (gameInfo[room].playedCards.indexOf(-1)<0) { // everyone has played
	    gameInfo[room].turn=-1;
	    // determine who won the trick
	    // either highest trump
	    var vm=1000; var im;
	    var s; var s0=common.suit(gameInfo[room].firstplayedCard);
	    var v;
	    for (var ii=0; ii<4; ii++)
	    {
		s=common.suit(gameInfo[room].playedCards[ii]);
		if (s==gameInfo[room].trump) v=common.trumpordering[gameInfo[room].playedCards[ii]%8];
		else if (s==s0) v=8+common.nontrumpordering[gameInfo[room].playedCards[ii]%8];
		if (v<vm) { vm=v; im=ii; }
	    }
	    gameInfo[room].turn=im;
	    io.in(room).emit("gameInfo",gameInfo[room]); // send so people know which card was played last before cleaning up
	    // tricks
	    for (var ii=0; ii<4; ii++)
		gameInfo[room].tricks[im%2].push(gameInfo[room].playedCards[ii]);
	    // clean up
	    gameInfo[room].playedCards=[-1,-1,-1,-1];
	    gameInfo[room].firstplayedCard=-1;
	    // is it last round?
	    if (gameInfo[room].numcards[0]==0) { // not great
		// score calculation
		var sc=[0,0];
		sc[im%2]=10; // 10 extra for last trick
		for (var ii=0; ii<2; ii++)
		    for (var jj=0; jj<gameInfo[room].tricks[ii].length; jj++) {
			var c=gameInfo[room].tricks[ii][jj];
			if (common.suit(c)==gameInfo[room].trump)
			    sc[ii]+=common.trumpvalue[c%8];
			else sc[ii]+=common.nontrumpvalue[c%8];
		    }
		io.in(room).emit("message", {
		    name: "Broadcast",
		    text: gameInfo[room].playerNames[0]+"/"+gameInfo[room].playerNames[2]+": "+sc[0]+" pts<br/>"
			+gameInfo[room].playerNames[1]+"/"+gameInfo[room].playerNames[3]+": "+sc[1]+" pts", 
		    timestamp: moment().valueOf()
		});
		// scorekeeping
		/*
		for (var ii=0; ii<2; ii++)
		    gameInfo[room].scores[ii]+=10*Math.round(sc[ii]/10); // variation of the rules
		*/
		if ((sc[gameInfo[room].bidplayer%2]>81)&&(((gameInfo[room].bid=="all")&&(gameInfo[room].tricks[gameInfo[room].bidplayer%2].length==8))||((gameInfo[room].bid!="all")&&(sc[gameInfo[room].bidplayer%2]>gameInfo[room].bid)))) {
		    gameInfo[room].scores[gameInfo[room].bidplayer%2]+=gameInfo[room].bid == "all" ? 250 : gameInfo[room].bid;
		    io.in(room).emit("message", {
			name: "Broadcast",
			text: "Bid successful<br/>"
			    +gameInfo[room].playerNames[0]+"/"+gameInfo[room].playerNames[2]+": "+gameInfo[room].scores[0]+" pts<br/>"
			    +gameInfo[room].playerNames[1]+"/"+gameInfo[room].playerNames[3]+": "+gameInfo[room].scores[1]+" pts", 
			timestamp: moment().valueOf()
		    });
		}
		else {
		    gameInfo[room].scores[(gameInfo[room].bidplayer+1)%2]+=gameInfo[room].bid == "all" ? 250 : gameInfo[room].bid;
		    io.in(room).emit("message", {
			name: "Broadcast",
			text: "Bid unsuccessful<br/>"
			    +gameInfo[room].playerNames[0]+"/"+gameInfo[room].playerNames[2]+": "+sc[0]+" pts<br/>"
			    +gameInfo[room].playerNames[1]+"/"+gameInfo[room].playerNames[3]+": "+sc[1]+" pts", 
			timestamp: moment().valueOf()
		    });
		}
		gameInfo[room].deck=gameInfo[room].tricks[0].concat(gameInfo[room].tricks[1]); // reform the deck
		io.in(room).emit("gameInfo",gameInfo[room]);
		setTimeout(startRound,3000,room);
		return;
	    }
	}
	else gameInfo[room].turn=(gameInfo[room].turn+1)%4;

	// wrap up
	io.in(room).emit("message", {
	    name: "Broadcast",
	    text: name+" plays "+common.cardshtml[j]+"<br/>"
		+gameInfo[room].playerNames[gameInfo[room].turn]+"'s turn",
	    timestamp: moment().valueOf()
	});
	io.in(room).emit("gameInfo",gameInfo[room]);// resend all the info; is that a bit much?
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
    for (var i=0; i<people.length; i++)
    {
	j=0;
	while ((j<4)&&(clientInfo[people[i]].name!=gameInfo[room].playerNames[j])) j++;
	if (j<4)
	    players[j]=people[i];
    }

    // shuffle cards -- correction, cut!
    // TODO
    io.in(room).emit("message", {
	name: "Broadcast",
	text: "Round starting!",
	timestamp: moment().valueOf()
    });

    // tricks
    gameInfo[room].tricks=[[],[]];
    
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
    
    gameInfo[room].numcards=[8,8,8,8];
    gameInfo[room].playedCards=[-1,-1,-1,-1];
    gameInfo[room].firstplayedCard=-1;

    gameInfo[room].bidding=true;
    gameInfo[room].trump=-1;
    gameInfo[room].bid=70; gameInfo[room].bidplayer=-1; gameInfo[room].bidpasses=0;
    gameInfo[room].lastbids=[null,null,null,null];
    gameInfo[room].playing=false;
     
    // starting player
    gameInfo[room].startingPlayer++;
    gameInfo[room].turn=gameInfo[room].startingPlayer;

    // send the private info: hand
    for (i=0; i<4; i++)
	io.to(players[i]).emit("hand", gameCards[room][i]);

    io.in(room).emit("gameInfo", gameInfo[room]); // send all the public info to clients

}
