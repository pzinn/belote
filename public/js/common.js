// create card html
suitshtml0=["&spades;","&hearts;","&diams;","&clubs;"];
rankshtml=["A","K","Q","J","10","9","8","7"];
cardshtml0=suitshtml0.map(s=>rankshtml.map(c=>c+s));
// cardshtml=cardshtml.flat(); // node.js>=11
cardshtml0=[].concat.apply([],cardshtml0);
cardshtml=[]; suitshtml=[];
trumpordering=[2,4,5,0,3,1,6,7];
nontrumpordering=[0,2,3,4,1,5,6,7];
trumpvalue=[11,4,3,20,10,14,0,0];
nontrumpvalue=[11,4,3,2,10,0,0,0];

cols=["black","red","red","black"];
for (var i=0; i<4; i++) {
    for (var j=0; j<8; j++) cardshtml[i*8+j]="<span style='color:"+cols[i]+"'>"+cardshtml0[i*8+j]+"</span>";
    suitshtml[i]="<span style='color:"+cols[i]+"'>"+suitshtml0[i]+"</span>";
}

function suit(card) {
    return Math.floor(card/8);
}

function validCard(playedCards,firstplayedCard,hand,trump,turn,card) {
    var i;
    if (card<0) return false;
    if (firstplayedCard<0) return true; // first player can do anything

    var s0=suit(firstplayedCard);
    var s=suit(card);

    var partnerDom;
    // figure out if partner dominant
    var vm=1000; var im;
    var v,ss;
    for (var ii=0; ii<4; ii++)
	if (playedCards[ii]>=0)
    {
	ss=suit(playedCards[ii]);
	if (ss==trump) v=trumpordering[playedCards[ii]%8];
	else if (ss==s0) v=8+nontrumpordering[playedCards[ii]%8];
	if (v<vm) { vm=v; im=ii; }
    }
    partnerDom=(im==(turn+2)%4);

    if ((s0!=trump)&&(s==s0)) return true;
    if ((s==trump)&&((s0==trump)||!partnerDom)) { // must be higher than any other trump if one can
	var m=1000;
	for (i=0; i<playedCards.length; i++)
	    if ((suit(playedCards[i])==trump)&&(trumpordering[playedCards[i]%8]<m)) m=trumpordering[playedCards[i]%8];
	if (trumpordering[card%8]>m) // played a lower trump. means one doesn't have higher
	    for (i=0; i<hand.length; i++)
		if ((suit(hand[i])==trump)&&(trumpordering[hand[i]%8]<m)) return false;
    }
    if (s==s0) return true; // case of trump
    // at this stage that means we shouldn't have that suit
    for (i=0; i<hand.length; i++)
	if (suit(hand[i])==s0) return false;
    if ((s==trump)|partnerDom) return true;
    for (i=0; i<hand.length; i++)
	if (suit(hand[i])==trump) return false;
    return true;
}

function process_bid(gameInfo,message) {
    if ((gameInfo===null)||(!gameInfo.bidding)) return false; // not bidding
    var name=message.name;
    var i = gameInfo.playerNames.indexOf(name); // player number
    if (i != gameInfo.turn) return false; // bidding out of turn
    if (((typeof message.arg === "string") && (message.arg.toLowerCase()=="pass"))||((typeof message.arg[0] === "string") && (message.arg[0].toLowerCase()=="pass"))) {
	gameInfo.lastbids[i]="pass"; // logging bids
	gameInfo.bidpasses++;
	if ((gameInfo.bidpasses==3)&&(gameInfo.bidplayer>=0)) {
	    gameInfo.bidding=false;
	    gameInfo.playing=true;
	    gameInfo.turn=gameInfo.startingPlayer;
	}
    } else {
	if ((message.arg[0]!="all")&&((message.arg[0]<=gameInfo.bid)||(gameInfo.bid=="all")||(message.arg[0]%10!=0)||(message.arg[0]>160))) return false; // shouldn't happen
	gameInfo.bid=message.arg[0];
	gameInfo.trump= typeof message.arg[1] === "string" ? suitshtml0.indexOf(message.arg[1]) : message.arg[1];
	gameInfo.bidplayer = i;
	gameInfo.lastbids[i]=[gameInfo.bid,gameInfo.trump]; // logging bids
	gameInfo.bidpasses=0;
    }
    gameInfo.turn=(gameInfo.turn+1)%4;
    return true;
}

function process_play(gameInfo,hand,message) { // if hand is null, means someone else is playing than client so ignore that part
    if ((gameInfo===null)||(!gameInfo.playing)) return false; // not playing
    var i = gameInfo.playerNames.indexOf(name); // player number
    if (i != gameInfo.turn) return false; // playing out of turn
    var j = message.arg; // played card
    if (!common.validCard(gameInfo.playedCards,gameInfo.firstplayedCard,j,gameInfo.trump,gameInfo.turn,j)) return false;

    if (hand!==null) {
	var k = hand.indexOf(j);
	if (k<0) return false; // card not in hand
	// remove card from hand
	hand.splice(k,1);
    }
    gameInfo.numcards[i]--;
    gameInfo.playedCards[i]=j;

    // process the actual play
    if (gameInfo.firstplayedCard<0) { // first player determines suit
	gameInfo.firstplayedCard=j;
    }
    if (gameInfo.playedCards.indexOf(-1)<0) { // everyone has played
	// determine who won the trick
	// either highest trump
	var vm=1000; var im;
	var s; var s0=suit(gameInfo.firstplayedCard);
	var v;
	for (var ii=0; ii<4; ii++)
	{
	    s=suit(gameInfo.playedCards[ii]);
	    if (s==gameInfo.trump) v=trumpordering[gameInfo.playedCards[ii]%8];
	    else if (s==s0) v=8+nontrumpordering[gameInfo.playedCards[ii]%8];
	    if (v<vm) { vm=v; im=ii; }
	}
	gameInfo.turn=im;
//	io.in(room).emit("gameInfo",gameInfo); // send so people know which card was played last before cleaning up
	// tricks
	for (var ii=0; ii<4; ii++)
	    gameInfo.tricks[im].push(gameInfo.playedCards[ii]);
	// clean up
	gameInfo.playedCards=[-1,-1,-1,-1];
	gameInfo.firstplayedCard=-1;
	// is it last round?
	if (gameInfo.numcards[0]==0) { // not great
	    // score calculation
	    var sc=[0,0];
	    sc[im%2]=10; // 10 extra for last trick
	    for (var ii=0; ii<4; ii++)
		for (var jj=0; jj<gameInfo.tricks[ii].length; jj++) {
		    var c=gameInfo.tricks[ii][jj];
		    sc[ii%2] += suit(c)==gameInfo.trump ? trumpvalue[c%8] : nontrumpvalue[c%8];
		}
/*
	    io.in(room).emit("message", {
		name: "Broadcast",
		text: gameInfo.playerNames[0]+"/"+gameInfo.playerNames[2]+": "+sc[0]+" pts<br/>"
		    +gameInfo.playerNames[1]+"/"+gameInfo.playerNames[3]+": "+sc[1]+" pts",
		timestamp: moment().valueOf()
	    });
*/
	    // scorekeeping
	    /*
	      for (var ii=0; ii<2; ii++)
	      gameInfo.scores[ii]+=10*Math.round(sc[ii]/10); // variation of the rules
	    */
	    if ((sc[gameInfo.bidplayer%2]>81)
		&&(((gameInfo.bid=="all")&&(gameInfo.tricks[gameInfo.bidplayer].length+gameInfo.tricks[(gameInfo.bidplayer+2)%4].length==8))
		   ||((gameInfo.bid!="all")&&(sc[gameInfo.bidplayer%2]>gameInfo.bid)))) {
		gameInfo.scores[gameInfo.bidplayer%2]+=gameInfo.bid == "all" ? 250 : gameInfo.bid;
/*
		io.in(room).emit("message", {
		    name: "Broadcast",
		    text: "Bid successful<br/>"
			+"Total "+gameInfo.playerNames[0]+"/"+gameInfo.playerNames[2]+": "+gameInfo.scores[0]+" pts<br/>"
			+"Total "+gameInfo.playerNames[1]+"/"+gameInfo.playerNames[3]+": "+gameInfo.scores[1]+" pts",
		    timestamp: moment().valueOf()
		});
*/
	    }
	    else {
		gameInfo.scores[(gameInfo.bidplayer+1)%2]+=gameInfo.bid == "all" ? 250 : gameInfo.bid;
		/*
		io.in(room).emit("message", {
		    name: "Broadcast",
		    text: "Bid unsuccessful<br/>"
			+"Total "+gameInfo.playerNames[0]+"/"+gameInfo.playerNames[2]+": "+sc[0]+" pts<br/>"
			+"Total "+gameInfo.playerNames[1]+"/"+gameInfo.playerNames[3]+": "+sc[1]+" pts",
		    timestamp: moment().valueOf()
		});
*/
	    }
	    gameInfo.deck=gameInfo.tricks[0].concat(gameInfo.tricks[1],gameInfo.tricks[2],gameInfo.tricks[3]); // reform the deck
//	    io.in(room).emit("gameInfo",gameInfo); // show cleanup
//	    setTimeout(startRound,5000,room);
//	    return;
	}
/*	io.in(room).emit("message", {
	    name: "Broadcast",
	    text: name+" plays "+common.cardshtml[j]+"<br/>"
		+gameInfo.playerNames[im]+" wins, his turn",
	    timestamp: moment().valueOf()
	});
	setTimeout(function(room) {	io.in(room).emit("gameInfo",gameInfo); },2000,room); // still not quite right
	return;
*/
    }
    else gameInfo.turn=(gameInfo.turn+1)%4;
    // wrap up
/*    io.in(room).emit("message", {
	name: "Broadcast",
	text: name+" plays "+common.cardshtml[j]+"<br/>"
	    +gameInfo.playerNames[gameInfo.turn]+"'s turn",
	timestamp: moment().valueOf()
    });
    io.in(room).emit("gameInfo",gameInfo);// resend all the info; is that a bit much?
*/
    return true;
}

// for server
if (typeof exports !== 'undefined') {
    exports.cardshtml=cardshtml;
    exports.suitshtml=suitshtml;
    exports.cardshtml0=cardshtml0;
    exports.suitshtml0=suitshtml0;
    exports.validCard=validCard;
    exports.suit=suit;
    exports.trumpordering=trumpordering;
    exports.nontrumpordering=nontrumpordering;
    exports.trumpvalue=trumpvalue;
    exports.nontrumpvalue=nontrumpvalue;
    exports.process_bid=process_bid;
    exports.process_play=process_play;
}
