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

function start_playing(gameInfo,message) {
    gameInfo.lastbids[i]=message.arg; // logging bids
    gameInfo.bidding=false;
    gameInfo.playing=true;
    gameInfo.turn=gameInfo.startingPlayer;
}

function process_bid(gameInfo,message) {
    if ((gameInfo===null)||(!gameInfo.bidding)) return false; // not bidding
    var name=message.name;
    var i = gameInfo.playerNames.indexOf(name); // player number
    if (i != gameInfo.turn) return false; // bidding out of turn
    // bit of a hack: fixing the message
    if (typeof message.arg === "string") message.arg=message.arg.toLowerCase();
    if (typeof message.arg[0] === "string")
	if ((message.arg[0].toLowerCase()=="pass")||(message.arg[0].toLowerCase()=="coinche")) message.arg=message.arg[0].toLowerCase();
    else message.arg[0]=+message.arg[0];
    //
    if (message.arg == "pass")
    {
	gameInfo.bidPasses++;
	if (gameInfo.bidPasses==4) { gameInfo.lastbids[i]=message.arg; gameInfo.turn=-1; return true; }
	if ((gameInfo.bidPasses==3)&&(gameInfo.bidPlayer>=0)) {
	    start_playing(gameInfo,message);
	    return true;
	}
    } else if (message.arg == "coinche") {
	if (gameInfo.coinche)
	    if (gameInfo.surcoinche) return false; else {
		gameInfo.surcoinche=true;
		start_playing(gameInfo,message);
		return true;
	    }
	gameInfo.coinche=true;
    }
    else {
	if (gameInfo.coinche) return false; // can't bid after coinche
	if ((message.arg[0]!="all")&&((message.arg[0]<=gameInfo.bid)||(gameInfo.bid=="all")||(message.arg[0]%10!=0)||(message.arg[0]>160))) return false; // shouldn't happen
	gameInfo.bid=message.arg[0];
	var k=-1;
	if (typeof message.arg[1] === "string") k=suitshtml0.indexOf(message.arg[1]);
	if (k<0) k=+message.arg[1];
	if ((k<0)||(k>3)) return false;
	gameInfo.trump = k;
	gameInfo.bidPlayer = i;
	gameInfo.bidPasses=0;
    }
    gameInfo.lastbids[i]=message.arg; // logging bids
    gameInfo.turn=(gameInfo.turn+1)%4;
    return true;
}

function process_play(gameInfo,hand,message) { // if hand is null, means someone else is playing than client so ignore that part
    if ((gameInfo===null)||(!gameInfo.playing)) return false; // not playing
    var name=message.name;
    var i = gameInfo.playerNames.indexOf(name); // player number
    if (i != gameInfo.turn) return false; // playing out of turn
    var j = +message.arg; // played card
    if (hand!==null) {
	var k = hand.indexOf(j);
	if (k<0) return false; // card not in hand
	if (!validCard(gameInfo.playedCards,gameInfo.firstplayedCard,hand,gameInfo.trump,gameInfo.turn,j)) return false;
	// remove card from hand
	hand.splice(k,1);
    }
    gameInfo.numcards[i]--;
    gameInfo.playedCards[i]=j;
    gameInfo.lastTrick=null; // only used in case of trick see below

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
	// tricks
	for (var ii=0; ii<4; ii++)
	    gameInfo.tricks[im].push(gameInfo.playedCards[ii]);
	// clean up
	gameInfo.lastTrick=gameInfo.playedCards; // ... but keep a copy for clients
	gameInfo.playedCards=[-1,-1,-1,-1];
	gameInfo.firstplayedCard=-1;
	// is it last round?
	if (gameInfo.numcards[0]==0) { // not great
	    // score calculation
	    gameInfo.roundScores=[0,0];
	    gameInfo.roundScores[im%2]=10; // 10 extra for last trick
	    for (var ii=0; ii<4; ii++)
		for (var jj=0; jj<gameInfo.tricks[ii].length; jj++) {
		    var c=gameInfo.tricks[ii][jj];
		    gameInfo.roundScores[ii%2] += suit(c)==gameInfo.trump ? trumpvalue[c%8] : nontrumpvalue[c%8];
		}
	    // scorekeeping
	    gameInfo.bidSuccess= ((gameInfo.roundScores[gameInfo.bidPlayer%2]>81)
			 &&(((gameInfo.bid=="all")&&(gameInfo.tricks[gameInfo.bidPlayer].length+gameInfo.tricks[(gameInfo.bidPlayer+2)%4].length==8))
			    ||((gameInfo.bid!="all")&&(gameInfo.roundScores[gameInfo.bidPlayer%2]>=gameInfo.bid))));
	    var sc = (gameInfo.bid == "all" ? 250 : gameInfo.bid) * (gameInfo.coinche ? gameInfo.surcoinche? 4 : 2 : 1);
	    if (gameInfo.bidPlayer%2 == (gameInfo.bidSuccess?0:1)) {
		gameInfo.scores.push([sc,0]);
		gameInfo.totalScores[0]+=sc;
	    } else {
		gameInfo.scores.push([0,sc]);
		gameInfo.totalScores[1]+=sc;
	    }
	    // variation of the rule
	    /*
	      for (var ii=0; ii<2; ii++)
		  gameInfo.totalScores[ii]+=10*Math.round(gameInfo.roundScores[ii]/10);
	    */
	    gameInfo.deck=gameInfo.tricks[0].concat(gameInfo.tricks[1],gameInfo.tricks[2],gameInfo.tricks[3]); // reform the deck
	}
    }
    else gameInfo.turn=(gameInfo.turn+1)%4;

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
