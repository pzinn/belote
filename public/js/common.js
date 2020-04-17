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
    if (i != gameInfo.turn) return false; // playing out of turn
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
}
