// - cards sometimes not appearing at start of game

// - backs of cards should have the same color
// - one should be able to reorder cards
// - lower res versions of cards
// - timeout on "typing..." not working


var socket = io();
// listen for server connection
// get query params from url
var url=new URL(window.location.href);
var name = url.searchParams.get("name") || 'Anonymous';
var room = url.searchParams.get("room") || 'No Room Selected';
var pos=-1; // my number in game
var gameInfo=null; // public info on current game
var hand=[]; // my hand
var auto=(name[0]=="@"); // TEMP obviously
var animation=false; // the little trick animation

var dirs=["S","W","N","E"]; var cols=["red","green","blue","yellow"]; var prefix="cards/";

var mysuit=-1;
var mybid=-1;
var bidlist=["80","90","100","110","120","130","140","150","160","all"];

document.getElementById("room-title").innerHTML=room;

// fires when client successfully connects to the server
socket.on("connect", function() {
    console.log("Connected to Socket I/O Server!");
    console.log(name + " wants to join  " + room);
    // to join a specific room
    socket.emit('joinRoom', {
	name: name,
	room: room
    });
});

//
function showAllowed() {
    for (var i=0; i<8; i++) {
	cardel=document.getElementById(dirs[0]+i);
	if (validCard(gameInfo.playedCards,gameInfo.firstplayedCard,hand,gameInfo.trump,+cardel.alt))
	    cardel.classList.add("active");
	else
	    cardel.classList.remove("active");	    
    }
}

function autoplay() {
    var i=Math.floor(Math.random()*hand.length);
    while (!validCard(gameInfo.playedCards,gameInfo.firstplayedCard,hand,gameInfo.trump,hand[i])) i=(i+1)%hand.length;
    play(hand[i]);
}

function autobid() {
    var b=+gameInfo.bid;
    if (Math.random()*160>b)
	bid(b+10,suit(hand[Math.floor(Math.random()*hand.length)]));
    else
	bid("pass");
    
}

/*
function unshowAllowed() {
    for (var i=0; i<8; i++) {
	cardel=document.getElementById(dirs[0]+i);
	cardel.classList.remove("active");	    
    }
}
*/


// print message
function insertMessage(message,extraClass) {
    var messages = document.getElementById("messages");
    var messageitem = document.createElement("li");   
    var momentTimestamp = moment.utc(message.timestamp).local().format("h:mm a");
    messageitem.className="list-group-item";
    messageitem.innerHTML="<span class='message-stamp'>" + message.name + " " + momentTimestamp + "</span><span class='message "+extraClass+"'>" + message.text +"</span>";
    messages.appendChild(messageitem);
    // handle autoscroll
    messages.scrollTop=messages.scrollHeight;
    messages.scrollLeft=0;
}

function updatePic(img,file) {
    img.src=file;
}

var oldgameInfo; // eww

function drawHandCards() {
    for (var i=0; i<4; i++)
    {
	var k=(i+4-pos)%4; // position relative to me
	// names (shouldn't change but who knows?) plus indicates whose turn it is TEMP move somewhere more reasonable
	var nameel=document.getElementById(dirs[k]+"name");
	nameel.innerHTML=gameInfo.playerNames[i];
	if (i==gameInfo.turn) nameel.style.border="3px solid #FF0000"; else nameel.style.border="3px solid transparent";
	
	if (i!=pos) // don't draw one's cards
	    for (var j=0; j<8; j++)
		updatePic(document.getElementById(dirs[k]+j),
			  j<gameInfo.numcards[i] ? "images/"+prefix+cols[i]+"_back.png" : "images/"+prefix+"cardholder.png");
    }
}

function redrawHandCards() { // same as drawHandCards except do minimal change
   for (var i=0; i<4; i++)
    {
	var k=(i+4-pos)%4; // position relative to me
	// names (shouldn't change but who knows?) plus indicates whose turn it is TEMP	
	if (i!=pos) // don't draw one's cards
	    if (oldgameInfo.numcards[i]<gameInfo.numcards[i])
		for (var j=oldgameInfo.numcards[i]; j<gameInfo.numcards[i]; j++)
		    updatePic(document.getElementById(dirs[k]+j),"images/"+prefix+cols[i]+"_back.png");
	    else
	      for (var j=gameInfo.numcards[i]; j<oldgameInfo.numcards[i]; j++)
		    updatePic(document.getElementById(dirs[k]+j),"images/"+prefix+"cardholder.png");
    }
}

function drawPlayedCards() {
    for (var i=0; i<4; i++)
    {
	var k=(i+4-pos)%4; // position relative to me
	// the played cards
	if ((oldgameInfo===null)||(gameInfo.playedCards[i]!==oldgameInfo.playedCards[i]))
	updatePic(document.getElementById(dirs[k]+"P"), // the played area
		  gameInfo.playedCards[i]>=0 ? "images/"+prefix+"card"+gameInfo.playedCards[i]+".png"
		  : "images/"+prefix+"cardholder.png");
    }
}

function drawCards() {
    if (oldgameInfo===null) drawHandCards(); else redrawHandCards();

    // bidding stuff
    for (var i=0; i<4; i++)
	document.getElementById("bidding"+dirs[i]).hidden=!gameInfo.bidding;
    
    // played cards if applicable
    document.getElementById("playedcards").hidden=!gameInfo.playing;
    if ((gameInfo.playing)&&(!animation)) drawPlayedCards();
}

function signalTurn() {
    var k;
    if (oldgameInfo!=null)
    {
	k=(oldgameInfo.turn+4-pos)%4; // position relative to me
	document.getElementById(dirs[k]+"name").style.border="3px solid transparent";
    }
    k=(gameInfo.turn+4-pos)%4; // position relative to me
    document.getElementById(dirs[k]+"name").style.border="3px solid  #FF0000";
}

socket.on("gameInfo", function(gameInfo1) {
    var i;
    oldgameInfo=gameInfo; gameInfo=gameInfo1;

    // general stuff (TEMP?)
    document.getElementById("bid").innerHTML= gameInfo.playing ? gameInfo.bid +" "+suitshtml[gameInfo.trump] : "";
    document.getElementById("score1").innerHTML=gameInfo.scores[0];
    document.getElementById("score2").innerHTML=gameInfo.scores[1];

    // fix for annoying lack of animation problem
    if ((!gameInfo.playing)&&animation) {	
    	animation=false; oldGameInfo.playedCards=[null,null,null,null];
	document.getElementById("playedcards").classList.remove("trick","N","E","S","W");	
    }
    
    if (oldgameInfo===null) { // first time (better criterion?) plus should differentiate first round etc
	document.getElementById("ready").disabled=true;
	document.getElementById("ready").checked=true;
	// determine my number -- wait, am I a player??
	pos=gameInfo.playerNames.indexOf(name);
	for (i=0; i<4; i++)
	  {
	    var k=(i+4-pos)%4; // position relative to me
	    var nameel=document.getElementById(dirs[k]+"name");
	    nameel.innerHTML=gameInfo.playerNames[i];
	    nameel.style.border="3px solid transparent";
	  }
	
	var message;
	if (gameInfo.playing) message = {
	    text: "Trump is "+suitshtml[gameInfo.trump]+"<br/>"
		+gameInfo.playerNames[gameInfo.turn]+"'s turn",
	    name: "System",
	    timestamp : moment().valueOf()
	};
	else if (gameInfo.bidding) message = {
	    text: "Current bid is "+(gameInfo.bidplayer>=0 ? gameInfo.bid+" "+suitshtml[gameInfo.trump]+" ("+gameInfo.playerNames[gameInfo.bidplayer]+")" : "none")
		+"<br/>"+gameInfo.playerNames[gameInfo.turn]+"'s turn",
	    name: "System",
	    timestamp : moment().valueOf()
	}
	else message="Welcome to Belote!";
	insertMessage(message,"");
	// write names in scores table
	document.getElementById("scoresname1").innerHTML=gameInfo.playerNames[0]+"<br/>"+gameInfo.playerNames[2];
	document.getElementById("scoresname2").innerHTML=gameInfo.playerNames[1]+"<br/>"+gameInfo.playerNames[3];
    }

    signalTurn();
    
    drawCards();

    if (gameInfo.bidding) {
	for (var j=0; j<4; j++) {
	    var k=(j+4-pos)%4; // position relative to me	    
	    for (i=0; i<4; i++)
		if ((gameInfo.lastbids[j] instanceof Array)&&(gameInfo.lastbids[j][1]==i))
		    document.getElementById("suit"+i+dirs[k]).classList.add("btn-primary");
	    else		
		document.getElementById("suit"+i+dirs[k]).classList.remove("btn-primary");
	    for (i=0; i<bidlist.length; i++)
		if ((gameInfo.lastbids[j] instanceof Array)&&(gameInfo.lastbids[j][0]==bidlist[i]))
		    document.getElementById(bidlist[i]+dirs[k]).classList.add("btn-primary");
	    else
		document.getElementById(bidlist[i]+dirs[k]).classList.remove("btn-primary");
	    if (gameInfo.lastbids[j]=="pass")
		document.getElementById("pass"+dirs[k]).classList.add("btn-primary");
	    else
		document.getElementById("pass"+dirs[k]).classList.remove("btn-primary");
	}
    }

    if (gameInfo.playing&&(gameInfo.playedCards.indexOf(-1)<0)) { // everyone has played
	document.getElementById("playedcards").addEventListener("transitionend", function() {
	    animation=false; oldgameInfo=null;
	    drawPlayedCards();
	    this.classList.remove("trick","N","E","S","W");
	});
	animation=true;
	document.getElementById("playedcards").classList.add("trick",dirs[(gameInfo.turn+4-pos)%4]);
    }

    if (gameInfo.turn==pos) {
	if (gameInfo.playing)
	    if (auto) setTimeout(autoplay,500); else showAllowed();
	else if (gameInfo.bidding)
	    if (auto) setTimeout(autobid,500); else {
	      for (i=0; i<4; i++)
		{
		  document.getElementById("suit"+i+dirs[0]).classList.remove("btn-primary");
		  document.getElementById("suit"+i+dirs[0]).disabled=false;
		}
	      for (i=0; i<bidlist.length; i++)
		{
		  document.getElementById(bidlist[i]+dirs[0]).classList.remove("btn-primary");
		  document.getElementById(bidlist[i]+dirs[0]).disabled=false;
		}
	      document.getElementById("pass"+dirs[0]).classList.remove("btn-primary");
	      document.getElementById("pass"+dirs[0]).disabled=false;
	      mybid=mysuit=-1;
	    }
    } else if (gameInfo.bidding) {
	      var i;
	      for (i=0; i<4; i++)
		  document.getElementById("suit"+i+dirs[0]).disabled=true;
	      for (i=0; i<bidlist.length; i++)
		  document.getElementById(bidlist[i]+dirs[0]).disabled=true;
	      document.getElementById("pass"+dirs[0]).disabled=true;
    }    
});

socket.on("hand", function(h) {
    hand=h;
    var message = {
	text: "Your hand is "+hand.map(i=>"<a onclick='play("+i+")'>"+cardshtml[i]+"</a>").join(),
	name: "System",
	timestamp : moment().valueOf()
    };
    insertMessage(message,"");
    // now pictures
    for (var i=0; i<8; i++)
    {
	var cardel=document.getElementById(dirs[0]+i);
	if (i<hand.length)
	{
	    updatePic(cardel,"images/"+prefix+"card"+hand[i]+".png");
	    cardel.alt=hand[i];
	    cardel.onclick=function() { play(+this.alt); } // eww
	}
	else
	{
	    updatePic(cardel,"images/cards/cardholder.png");
	    cardel.onclick=null;
	    cardel.alt=-1;
	}
	cardel.classList.remove("active");
    }
});

socket.on("trick", function(winner) {
    // TODO: have actual tricks accumulating
    document.getElementById("playedcards").addEventListener("transitionend", function() {
	this.classList.remove("trick","N","E","S","W");
	animation=false;
	oldgameInfo=null;
	drawCards();
    });
    // fix for annoying lack of animation problem
    if (animation) document.getElementById("playedcards").classList.remove("trick","N","E","S","W");
    animation=true;
    document.getElementById("playedcards").classList.add("trick",dirs[(winner+4-pos)%4]);
});

// other user messaged
socket.on("message", function(message) {
    console.log("New Message !");
    console.log(message.text);
    // insert messages in container
    insertMessage(message,"");

    // try notify , only when user has not open chat view
    if (document[hidden]) {
	notifyMe(message);
	// also notify server that user has not seen messgae
	var umsg = {
	    text: name + " has not seen message",
	    read: false
	};
	socket.emit("userSeen", umsg);
    } else {
	// notify  server that user has seen message
	var umsg = {
	    text: name + " has seen message",
	    read: true,
	    user: name
	};
	socket.emit("userSeen", umsg);
    }
});

function ready(flag) {
    socket.emit("ready",flag);
}


function bidsuit(s) {
    for (var i=0; i<4; i++)
	if (i==s)
	  document.getElementById("suit"+i+dirs[0]).classList.add("btn-primary");
	else
	  document.getElementById("suit"+i+dirs[0]).classList.remove("btn-primary");
    document.getElementById("pass"+dirs[0]).classList.remove("btn-primary");
    mysuit=s;
    if (mybid>0) bid(mybid,mysuit);
}

function prebid(b) {
    for (var i=0; i<bidlist.length; i++)
	if (bidlist[i]==b)
	  document.getElementById(bidlist[i]+dirs[0]).classList.add("btn-primary");
	else
	  document.getElementById(bidlist[i]+dirs[0]).classList.remove("btn-primary");
    document.getElementById("pass"+dirs[0]).classList.remove("btn-primary");
    mybid=b;
    if (mysuit>=0) bid(mybid,mysuit);
}

function bidpass() {
  var i;
  for (i=0; i<4; i++)
    document.getElementById("suit"+i+dirs[0]).classList.remove("btn-primary");
  for (i=0; i<bidlist.length; i++)
    document.getElementById(bidlist[i]+dirs[0]).classList.remove("btn-primary");
  document.getElementById("pass"+dirs[0]).classList.add("btn-primary");
  bid("pass");
}

function bid(b,s) {
    if ((gameInfo.turn==pos)&&gameInfo.bidding) { // more testing TODO	
	// TODO: graphical aspect
	socket.emit("bid", {
	    name: name,
	    timestamp : moment().valueOf(),
	    arg: [b,s]
	});
    }
}

function play(c) {
    if ((gameInfo.turn==pos)&&gameInfo.playing&&validCard(gameInfo.playedCards,gameInfo.firstplayedCard,hand,gameInfo.trump,c)) {
	oldgameInfo = { turn : gameInfo.turn }; // bit of a hack
	gameInfo.turn=(pos+1)%4; // a bit early; may have to undo
	signalTurn();
	// also possible issue of desync with server if play is rejected by server (which shouldn't happen of course)
	// remove card
	var j=hand.indexOf(c);
	if (j<0) alert("can't find card!");
	hand.splice(j,1);
	// update pictures
	for (var i=0; i<8; i++)
	{
	    var cardel=document.getElementById(dirs[0]+i);
	    if (cardel.alt==c)
	    {
		cardel.src="images/cards/cardholder.png";
		cardel.alt=-1;
	    }
	    cardel.classList.remove("active");
	}
	var cardel=document.getElementById(dirs[0]+"P"); // the played area
	cardel.src="images/"+prefix+"card"+c+".png";
	
	socket.emit("play", {
	    name: name,
	    timestamp : moment().valueOf(),
	    arg: c
	});
    }
}

// lame conversion
var escapeChars = {
    '<' : 'lt', // to avoid injection
    '>' : 'gt',
    '♠' : 'spades',
    '♥' : 'hearts',
    '♦' : 'diams',
    '♣' : 'clubs'
};

var regexString = '[';
for(var key in escapeChars) {
  regexString += key;
}
regexString += ']';

var regex = new RegExp( regexString, 'g');

function escapeHTML(str) {
  return str.replace(regex, function(m) {
    return '&' + escapeChars[m] + ';';
  });
};

// handles submitting of new message
var form = document.getElementById("messageform");
var message1 = document.getElementById("messagebox");
form.addEventListener("submit", function(event) {
    event.preventDefault();
    var msg = escapeHTML(message1.value).trim();
    if (msg === "") return -1; //empty messages cannot be sent

    var emitType="message";
    var arg="";
    if (msg[0] === "@") // special way of emitting from chat: first word is command
    {
	arg=msg.split(" ");
	emitType=arg[0].substring(1);
	if (arg.length==1) arg="";
	else if (arg.length==2) arg=arg[1];
	else arg.shift();
    }
    var message = {
	text: msg,
	name: name,
	timestamp : moment().valueOf(),
	arg: arg
    };
    socket.emit(emitType, message);
    insertMessage(message,"mine"); // could just let the server emit back instead
    message1.value="";
});


// minor events after that

// below code is to know when typing is there
var timeout;

function timeoutFunction() {
    typing = false;
    //console.log("stopped typing");
    // socket.emit("typing", false);
    socket.emit('typing', {
	text: "" //name + " stopped typing"
    });
}
// if key is pressed typing message is seen else auto after 2 sec typing false message is send
document.getElementById("messagebox").onkeyup= function() {
    console.log('happening');
    typing = true;
    document.getElementById("icon-type").className="";
    //console.log("typing typing ....");
    //socket.emit('typing', 'typing...');
    socket.emit('typing', {
	text: name + " is typing ..."
    });
    clearTimeout(timeout);
    timeout = setTimeout(timeoutFunction, 1000);
};

// below is the checking for page visibility api
var hidden, visibilityChange;
if (typeof document.hidden !== "undefined") { // Opera 12.10 and Firefox 18 and later support
    hidden = "hidden";
    visibilityChange = "visibilitychange";
} else if (typeof document.mozHidden !== "undefined") {
    hidden = "mozHidden";
    visibilityChange = "mozvisibilitychange";
} else if (typeof document.msHidden !== "undefined") {
    hidden = "msHidden";
    visibilityChange = "msvisibilitychange";
} else if (typeof document.webkitHidden !== "undefined") {
    hidden = "webkitHidden";
    visibilityChange = "webkitvisibilitychange";
}


//listening for typing  event
socket.on("typing", function(message) { //console.log(message.text);
    document.getElementById("typing").innerHTML=message.text;    
});

socket.on("userSeen", function(msg) {

    // if (msg.user == name) {
    // read message
    // show messags only to user who has typied
    var s="fa fa-check-circle";
    if (msg.read) {
	//user read the message
	s+="msg-read";
    } else {
	// message deleiverd but not read yet
	s+="msg-delieverd";
    }
    document.getElementById("icon-type").className=s;
    console.log(msg);
    //}
});


// notification message
function notifyMe(msg) {
    // Let's check if the browser supports notifications
    if (!("Notification" in window)) {
	alert("This browser does not support desktop notification,try Chromium!");
    }

    // Let's check whether notification permissions have already been granted
    else if (Notification.permission === "granted") {
	// If it's okay let's create a notification
	//  var notification = new Notification(msg);
	var notification = new Notification('Chat App', {
	    body: msg.name + ": " + msg.text,
	    icon: '/images/apple-icon.png' // optional
	});
	notification.onclick = function(event) {
	    event.preventDefault();
	    this.close();
	    // assume user would see message so broadcast userSeen event
	    var umsg = {
		text: name + " has seen message",
		read: true,
		user: name
	    };
	    socket.emit("userSeen", umsg);
	    //window.open('http://www.mozilla.org', '_blank');
	};
    }
    // Otherwise, we need to ask the user for permission
    else if (Notification.permission !== 'denied') {
	Notification.requestPermission(function(permission) {
	    // If the user accepts, let's create a notification
	    if (permission === "granted") {
		var notification = new Notification('Chat App', {
		    body: msg.name + ": " + msg.text,
		    icon: '/images/apple-icon.png' // optional
		});
		notification.onclick = function(event) {
		    event.preventDefault();
		    this.close();
		    var umsg = {
			text: name + " has seen message",
			read: true,
			user: name
		    };
		    socket.emit("userSeen", umsg);
		    // assume user would see message so broadcast userSeen event
		    //window.open('http://www.mozilla.org', '_blank');
		};
	    }
	});
    }

    // At last, if the user has denied notifications, and you
    // want to be respectful there is no need to bother them any more.
}
