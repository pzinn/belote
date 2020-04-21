// - mark first player
// - make suits bigger in chat
// - say who trick goes to?
// - undo?
// - lower res versions of cards?
// - timeout on "typing..." not working
// - the welcome message is weirdly split in 2 places

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
var trickAnimation=false; // the little trick animation

var dirs=["S","W","N","E"];
var prefix="images/cards/";
var cols=["green","green","green","green"]; //["red","green","blue","yellow"]; // backs of cards

var mysuit=-1;
var mybid=-1;
var bidlist=["80","90","100","110","120","130","140","150","160","all"];

document.getElementById("room-title").innerHTML=room;

// preload cards -- shoud I prefetch instead?
var preloadLink;
for (var i=0; i<32; i++)
{
    preloadLink = document.createElement("link");
    preloadLink.href = prefix+"card"+i+".png";
    preloadLink.rel = "preload";
    preloadLink.as = "image";
    document.head.appendChild(preloadLink);
}

// fires when client successfully connects to the server
socket.on("connect", function() {
    console.log("Connected to Socket I/O Server!");
    console.log(name + " wants to join  " + room);
    // to join a specific room
    socket.emit('joinRoom', {
	name: name,
	room: room
    });
    if (auto) {
    ready(true);
    document.getElementById("ready").disabled=true;
    document.getElementById("ready").checked=true;
    }
});

//
function showAllowed() {
    for (var i=0; i<8; i++) {
	cardel=document.getElementById(dirs[0]+i);
	if (validCard(gameInfo.playedCards,gameInfo.firstplayedCard,hand,gameInfo.trump,gameInfo.turn,+cardel.alt))
	    cardel.classList.add("active");
	else
	    cardel.classList.remove("active");	    
    }
}

function autoplay() {
    // make a list of valid cards
    var i,im;
    var v,vm=-1000;
    for (i=0; i<hand.length; i++)
	if (validCard(gameInfo.playedCards,gameInfo.firstplayedCard,hand,gameInfo.trump,gameInfo.turn,hand[i])) {
	    if (gameInfo.firstplayedCard<0) v=0; else {
		gameInfo.playedCards[pos]=hand[i]; // eww
		v= (whowonit(gameInfo.playedCards,gameInfo.firstplayedCard,gameInfo.trump)%2 == pos%2 ? 1 : -1)
		    *countPoints(gameInfo.playedCards,gameInfo.trump);
	    }
	    if (v+5*(Math.random()-0.5)>vm) {
		vm=v;
		im=i;
	    }
	}
    gameInfo.playedCards[pos]=-1; // eww
    play(hand[im]);
}

var autoeval=[];

function autobid() {
    if (gameInfo.coinche)
	bid("pass");
    var b=+gameInfo.bid;
    var i,j;
    if ((b=="all")||(b==160)) { bid("pass"); return; }
    if (autoeval.length==0) // evaluate hand
	for (i=0; i<4; i++)
    {
	autoeval[i]=countPoints(hand,i);
	for (j=0; j<8; j++)
	    if (suit(hand[j])==i) autoeval[i]+=5;
    }
    while (true) {
	i=Math.floor(Math.random()*4);
	if (autoeval[i]*1.5-Math.random()*10>b) {
	    bid(b+10,i);
	    return;
	}
	else if (Math.random()<0.2) {
	    bid("pass");
	    return;
	}
    }
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
function insertMessage(message) {
    var messages = document.getElementById("messages");
    var messageitem = document.createElement("li");   
    var momentTimestamp = moment.utc(message.timestamp).local().format("h:mm a");
    messageitem.className="list-group-item";
    messageitem.innerHTML="<span class='message-stamp'>" + message.name + " " + momentTimestamp + "</span><span class='message'>" + message.arg +"</span>";
    messages.appendChild(messageitem);
    // handle autoscroll
    messages.scrollTop=messages.scrollHeight;
    messages.scrollLeft=0;
}

function updatePic(img,file) {
    img.src=file;
}

function drawHandCards() {
    for (var i=0; i<4; i++) {
	var k=(i+4-pos)%4; // position relative to me
	if (i!=pos) // don't draw one's cards	    
	    for (var j=0; j<8; j++)
		updatePic(document.getElementById(dirs[k]+j),
			  j<gameInfo.numcards[i] ? prefix+cols[i]+"_back.png" : prefix+"cardholder.png");
    }
}

function drawTricks() {
    for (var i=0; i<4; i++) {
	var k=(i+4-pos)%4; // position relative to me
	for (var j=0; j<8; j++)
	    updatePic(document.getElementById("trick"+dirs[k]+j),
		      j<gameInfo.tricks[i].length/4 ? prefix+cols[i]+"_back.png" : prefix+"cardholder.png");	
    }
}

function drawPlayedCard(i) {
    var k=(i+4-pos)%4; // position relative to me
    // the played cards
    //	if ((oldgameInfo===null)||(gameInfo.playedCards[i]!==oldgameInfo.playedCards[i]))
    var cardel=document.getElementById(dirs[k]+"P");
    if (!(cardel.hidden=gameInfo.playedCards[i]<0))
    updatePic(cardel, // the played area
	      prefix+"card"+gameInfo.playedCards[i]+".png");
}

function drawPlayedCards() {
    for (var i=0; i<4; i++)
	drawPlayedCard(i);
}

function drawCards() {
    drawHandCards();
    drawTricks();
    
    // played cards if applicable
    document.getElementById("playedcards").hidden=!gameInfo.playing;
    if (gameInfo.playing) drawPlayedCards();
}

function drawBid(j) {
    var k=(j+4-pos)%4; // position relative to me
    for (var i=0; i<4; i++)
	if ((gameInfo.lastbids[j] instanceof Array)&&(gameInfo.lastbids[j][1]==i))
	    document.getElementById("suit"+i+dirs[k]).classList.add("btn-primary");
    else
	document.getElementById("suit"+i+dirs[k]).classList.remove("btn-primary");
    for (var i=0; i<bidlist.length; i++)
	if ((gameInfo.lastbids[j] instanceof Array)&&(gameInfo.lastbids[j][0]==bidlist[i]))
	    document.getElementById(bidlist[i]+dirs[k]).classList.add("btn-primary");
    else
	document.getElementById(bidlist[i]+dirs[k]).classList.remove("btn-primary");
    if (gameInfo.lastbids[j]=="pass")
	document.getElementById("pass"+dirs[k]).classList.add("btn-primary");
    else
	document.getElementById("pass"+dirs[k]).classList.remove("btn-primary");
    if (gameInfo.lastbids[j]=="coinche")
	document.getElementById("coinche"+dirs[k]).classList.add("btn-primary");
    else
	document.getElementById("coinche"+dirs[k]).classList.remove("btn-primary");
}

function drawBids() {
    var i;
    for (i=0; i<4; i++)
	document.getElementById("bidding"+dirs[i]).hidden=!gameInfo.bidding;
    if (gameInfo.bidding)
	for (i=0; i<4; i++) drawBid(i);
}

function writeNames() {
    var i,k,nameel;
    for (i=0; i<4; i++)
    {
	k=(i+4-pos)%4; // position relative to me
	//	document.getElementById("name"+dirs[k]).innerHTML=gameInfo.playerNames[i]+(i==gameInfo.startingPlayer?" *":"");
	nameel=document.getElementById("name"+dirs[k]);
	nameel.innerHTML=gameInfo.playerNames[i];
	if (i==gameInfo.startingPlayer) nameel.classList.add("first-player");
    }
}

function signalTurn() {
    var i,k;
    for (i=0; i<4; i++)
    {
	k=(i+4-pos)%4; // position relative to me
	document.getElementById("name"+dirs[k]).style.border= i==gameInfo.turn ? "3px solid  #FF0000" : "3px solid transparent";
    }

    if (gameInfo.turn==pos) {
	if (gameInfo.playing)
	    if (auto) setTimeout(autoplay,gameInfo.firstplayedCard<0 ? 1500 : 500); else showAllowed(); // first card played slower
	else if (gameInfo.bidding)
	    if (auto) setTimeout(autobid,500); else {
		for (i=0; i<4; i++)
		{
		    document.getElementById("suit"+i+dirs[0]).classList.remove("btn-primary");
		    document.getElementById("suit"+i+dirs[0]).disabled=gameInfo.coinche;
		}
		for (i=0; i<bidlist.length; i++)
		{
		    document.getElementById(bidlist[i]+dirs[0]).classList.remove("btn-primary");
		    document.getElementById(bidlist[i]+dirs[0]).disabled=gameInfo.coinche;
		}
		document.getElementById("pass"+dirs[0]).classList.remove("btn-primary");
		document.getElementById("pass"+dirs[0]).disabled=false;
		document.getElementById("coinche"+dirs[0]).disabled=(gameInfo.bidPlayer<0)||(((gameInfo.bidPlayer%2 == pos%2)||gameInfo.coinche)&&((gameInfo.bidPlayer%2 != pos%2)||!gameInfo.coinche||gameInfo.surcoinche));
		mybid=mysuit=-1;
	    }
    } else if (gameInfo.bidding) {
	var i;
	for (i=0; i<4; i++)
	    document.getElementById("suit"+i+dirs[0]).disabled=true;
	for (i=0; i<bidlist.length; i++)
	    document.getElementById(bidlist[i]+dirs[0]).disabled=true;
	document.getElementById("pass"+dirs[0]).disabled=true;
	document.getElementById("coinche"+dirs[0]).disabled=true;
	drawBid(gameInfo.turn); // to remove the previous bid
    }
}

function displayBid() {
    var bid="";
    if (gameInfo.playing) {
	bid+="<div>"+gameInfo.playerNames[gameInfo.bidPlayer]+"</div>";
	bid+="<div style='font-size:150%'>"+gameInfo.bid +" "+suitshtml[gameInfo.trump]+"</div>";
	if (gameInfo.surcoinche) bid+="surcoinche";
	else if (gameInfo.coinche) bid+="coinche";
    }
    document.getElementById("bid").innerHTML= bid;
}

function displayScores() {
    document.getElementById("scoresname1").innerHTML=gameInfo.playerNames[0]+"<br/>"+gameInfo.playerNames[2];
    document.getElementById("scoresname2").innerHTML=gameInfo.playerNames[1]+"<br/>"+gameInfo.playerNames[3];
    document.getElementById("totalscore1").innerHTML=gameInfo.totalScores[0];
    document.getElementById("totalscore2").innerHTML=gameInfo.totalScores[1];

    var tr,td;
    var el0=document.getElementById("scores");
    var el = el0.cloneNode(false);
    el0.parentNode.replaceChild(el, el0);
    for (var i=0; i<gameInfo.scores.length; i++) {
	tr=document.createElement("tr");
	for (var j=0; j<2; j++) {
	    td=document.createElement("td");
	    td.innerHTML=gameInfo.scores[i][j];
	    tr.appendChild(td);
	}
	el.appendChild(tr);
    }
}

socket.on("gameInfo", function(gameInfo1) {
    var i;
    gameInfo=gameInfo1;

    displayBid();

    displayScores();
    
    // fix for annoying lack of animation problem
    if ((!gameInfo.playing)&&trickAnimation) {
	trickAnimation=false;
	document.getElementById("playedcards").classList.remove("trick","N","E","S","W");	
    }
    
    document.getElementById("ready").disabled=true;
    // determine my number -- if I'm a player
    pos=gameInfo.playerNames.indexOf(name);
    document.getElementById("ready").checked= (pos>=0);

    writeNames();
	
    var message;
    if (gameInfo.playing) message = {
	arg: "Trump is "+suitshtml[gameInfo.trump]+"<br/>"
	    +gameInfo.playerNames[gameInfo.turn]+"'s turn",
	name: "System",
	timestamp : moment().valueOf()
    };
    else if (gameInfo.bidding) message = {
	arg: "Current bid is "+(gameInfo.bidPlayer>=0 ? gameInfo.bid+" "+suitshtml[gameInfo.trump]+" ("+gameInfo.playerNames[gameInfo.bidPlayer]+")" : "none")
	    +"<br/>"+gameInfo.playerNames[gameInfo.turn]+"'s turn",
	name: "System",
	timestamp : moment().valueOf()
    }
    else message=welcomeText;
    insertMessage(message,"");

    drawCards();

    drawBids();

    signalTurn();
});

socket.on("hand", function(h) {
    hand=h;
    var message = {
	arg: "Your hand is "+hand.map(i=>"<a onclick='play("+i+")'>"+cardshtml[i]+"</a>").join(),
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
	    updatePic(cardel,prefix+"card"+hand[i]+".png");
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
	cardel.draggable=true;
	cardel.ondragstart = function(event) { event.dataTransfer.setData("id",this.id); }
	cardel.ondragover = function(event) { event.preventDefault(); }
	cardel.ondrop = function(event) {
	    event.preventDefault();
	    var sourceid = event.dataTransfer.getData("id");
	    if ((typeof sourceid !== "undefined")&&(sourceid != this.id)) { // card swap
		var sourceel=document.getElementById(sourceid);
		var tmp = sourceel.src;
		sourceel.src = this.src;
		this.src = tmp;
		tmp = sourceel.alt;
		sourceel.alt = this.alt;
		this.alt = tmp;
		tmp = sourceel.className;
		sourceel.className = this.className;
		this.className = tmp;
	    }
	}
    }
    // for autoplay
    autoeval=[];
});

function ready(flag) {
    socket.emit("ready", {
	name: name,
	timestamp : moment().valueOf(),
	arg: flag
    });
}

function removebtn() {
    var i;
    for (i=0; i<4; i++)
	document.getElementById("suit"+i+dirs[0]).classList.remove("btn-info");
    for (i=0; i<bidlist.length; i++)
	document.getElementById(bidlist[i]+dirs[0]).classList.remove("btn-info");
    document.getElementById("pass"+dirs[0]).classList.remove("btn-info");
}

// these functions are crap

function bidsuit(s) {
    for (var i=0; i<4; i++)
	if (i==s)
	  document.getElementById("suit"+i+dirs[0]).classList.add("btn-info");
	else
	  document.getElementById("suit"+i+dirs[0]).classList.remove("btn-info");
    mysuit=s;
    if (mybid>=0) {
	removebtn();
	bid(mybid,mysuit);
	mybid=mysuit=-1;
    }
}

function prebid(b) {
    for (var i=0; i<bidlist.length; i++)
	if (bidlist[i]==b)
	    document.getElementById(bidlist[i]+dirs[0]).classList.add("btn-info");
    else
	document.getElementById(bidlist[i]+dirs[0]).classList.remove("btn-info");
    document.getElementById("pass"+dirs[0]).classList.remove("btn-info");
    mybid=b;
    if (mysuit>=0) {
	removebtn();
	bid(mybid,mysuit);
	mybid=mysuit=-1;
    }
}

function bidpass() {
    bid("pass");
    mybid=mysuit=-1;
}

function bidcoinche() {
    bid("coinche");
    mybid=mysuit=-1;
}    

function bid(b,s) {
    console.log("attempted bid "+b+" "+s);
    socket.emit("bid", {
	name: name,
	timestamp : moment().valueOf(),
	arg: [b,s]
    });
}

socket.on("bid", function(message) { // arg should be [bid,suit] where bid = number or "pass"
    if (process_bid(gameInfo,message)) { // succesful bid: update graphics
	var name=message.name;
	var i = gameInfo.playerNames.indexOf(name); // player number
	drawBid(i);
	if (gameInfo.playing) { // playing started: update visibility
	    for (var i=0; i<4; i++)
		document.getElementById("bidding"+dirs[i]).hidden=true;
	    document.getElementById("playedcards").hidden=false;
	    displayBid();
	}
	signalTurn();
    }
});


function play(c) {
    console.log("attempted play "+c);
    socket.emit("play", {
	name: name,
	timestamp : moment().valueOf(),
	arg: c
    });
}

var cardTransform= ["translate(-50%,0%)","translate(-50%,-50%) rotate(90deg) translate(0,-50%)","translate(-50%,0%) rotate(180deg)","translate(50%,-50%) rotate(-90deg) translate(0,-50%)"];
for (var i=0; i<4; i++)
    cardTransform[i]+=" translate(0px,170px)"; // very rough!

socket.on("play", function(message) {
    var name=message.name;
    var i = gameInfo.playerNames.indexOf(name); // player number
    if (process_play(gameInfo, i==pos ? hand : null, message)) { // succesful play: update graphics
	var k=(i+4-pos)%4; // position relative to me
	if (i==pos) {
	    // update pictures
	    for (var j=0; j<8; j++)
	    {
		var cardel=document.getElementById(dirs[0]+j);
		if (cardel.alt==message.arg)
		{
		    cardel.src="images/cards/cardholder.png";
		    cardel.alt=-1;
		}
		cardel.classList.remove("active");
	    }
	} else {
	    // pick a random card? TODO
	    var j=gameInfo.numcards[i];
	    updatePic(document.getElementById(dirs[k]+j),prefix+"cardholder.png");
	}
	// played card animation
	cardel=document.getElementById(dirs[k]+"P");
	cardel.style.transition="none";
	cardel.style.transform=cardTransform[k];
	setTimeout(function(k){
	    cardel=document.getElementById(dirs[k]+"P");
	    cardel.style.transition="transform 0.5s linear";
	    cardel.style.transform="";
	},1,k);
	if (gameInfo.lastTrick!==null) { // trick animation
	    gameInfo.playedCards[i]=gameInfo.lastTrick[i]; // eww
	    drawPlayedCard(i);
	    gameInfo.playedCards[i]=-1; // eww
	    if (trickAnimation) document.getElementById("playedcards").classList.remove("trick","N","E","S","W"); // fix for annoying lack of animation problem issue
	    setTimeout( function() {
//	    document.getElementById("playedcards").addEventListener("transitionend", function() {
		trickAnimation=false;
		drawPlayedCards();
		drawTricks();
		document.getElementById("playedcards").classList.remove("trick","N","E","S","W");
	    },2000);
	    trickAnimation=true;
	    document.getElementById("playedcards").classList.add("trick",dirs[(gameInfo.turn+4-pos)%4]);
	}
	else drawPlayedCard(i);

	if (Math.max(...gameInfo.numcards)==0) { // end of round: already display new scores
	    document.getElementById("totalscore1").innerHTML=gameInfo.totalScores[0];
	    document.getElementById("totalscore2").innerHTML=gameInfo.totalScores[1];
	    var el=document.getElementById("scores");
	    tr=document.createElement("tr");
	    for (var j=0; j<2; j++) {
		td=document.createElement("td");
		td.innerHTML=gameInfo.scores[gameInfo.scores.length-1][j];
		tr.appendChild(td);
	    }
	    el.appendChild(tr);
	}
	/*
	  if (gameInfo.bidding) { // back to bidding: update visibility
	  for (var i=0; i<4; i++)
	  document.getElementById("bidding"+dirs[i]).hidden=false;
	  document.getElementById("playedcards").hidden=true;
	  document.getElementById("bid").innerHTML="";
	  }
	*/
	signalTurn();
    }
});


socket.on("message", function(message) {
    console.log("New Message !");
    console.log(message.arg);
    // insert messages in container
    insertMessage(message);

    // try notify , only when user has not open chat view
    if (document[hidden]) {
	notifyMe(message);
	// also notify server that user has not seen messgae
	var umsg = {
	    arg: name + " has not seen message",
	    read: false
	};
	socket.emit("userSeen", umsg);
    } else {
	// notify  server that user has seen message
	var umsg = {
	    arg: name + " has seen message",
	    read: true,
	    user: name
	};
	socket.emit("userSeen", umsg);
    }
});


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
    var arg=msg;
    if (msg[0] === "@") // special way of emitting from chat: first word is command
    {
	insertMessage({name: name, timestamp : moment().valueOf(), arg:arg}); // @ commands are echo'ed
	arg=msg.split(" ");
	emitType=arg[0].substring(1);
	if (arg.length==1) arg="";
	else if (arg.length==2) arg=arg[1];
	else arg.shift();
    }
    var message = {
	name: name,
	arg: arg,
	timestamp : moment().valueOf(),
    };
    socket.emit(emitType, message);
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
	arg: "" //name + " stopped typing"
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
	arg: name + " is typing ..."
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
socket.on("typing", function(message) { //console.log(message.arg);
    document.getElementById("typing").innerHTML=message.arg;    
});

socket.on("userSeen", function(msg) {

    // if (msg.user == name) {
    // read message
    // show messags only to user who has typed
    var s="fa fa-check-circle";
    if (msg.read) {
	//user read the message
	s+="msg-read";
    } else {
	// message delivered but not read yet
	s+="msg-delievered";
    }
    document.getElementById("icon-type").className=s;
//    console.log(msg);
    //}
});


// notification message
function notifyMe(msg) {
    // Let's check if the browser supports notifications
    if (!("Notification" in window)) {
	alert("This browser does not support desktop notification");
    }

    // Let's check whether notification permissions have already been granted
    else if (Notification.permission === "granted") {
	// If it's okay let's create a notification
	//  var notification = new Notification(msg);
	var notification = new Notification('Belote', {
	    body: msg.name + ": " + msg.arg,
	    icon: '/images/apple-icon.png' // optional
	});
	notification.onclick = function(event) {
	    event.preventDefault();
	    this.close();
	    // assume user would see message so broadcast userSeen event
	    var umsg = {
		arg: name + " has seen message",
		read: true,
		user: name
	    };
	    socket.emit("userSeen", umsg);
	};
    }
    // Otherwise, we need to ask the user for permission
    else if (Notification.permission !== 'denied') {
	Notification.requestPermission(function(permission) {
	    // If the user accepts, let's create a notification
	    if (permission === "granted") {
		var notification = new Notification('Chat App', {
		    body: msg.name + ": " + msg.arg,
		    icon: '/images/apple-icon.png' // optional
		});
		notification.onclick = function(event) {
		    event.preventDefault();
		    this.close();
		    var umsg = {
			arg: name + " has seen message",
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
