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

function validCard(playedCards,firstplayedCard,hand,trump,card) { // missing the rule that if partner is dominant, no need to trump
    var i;
    if (card<0) return false;
    if (firstplayedCard<0) return true; // first player can do anything
    var s=suit(firstplayedCard);
    var ss=suit(card);
    if (ss==trump) { // must be higher than any other trump if one can
	var m=1000;
	for (i=0; i<playedCards.length; i++)
	    if ((suit(playedCards[i])==trump)&&(trumpordering[playedCards[i]%8]<m)) m=trumpordering[playedCards[i]%8];
	if (trumpordering[card%8]>m) // should be one can't
	    for (i=0; i<hand.length; i++)
		if ((suit(hand[i])==trump)&&(trumpordering[hand[i]%8]<m)) return -1;
    }
    if (ss==s) return true;
    // at this stage that means we don't have that suit
    for (i=0; i<hand.length; i++)
	if (suit(hand[i])==s) return false;
    if (ss==trump) return true; // TEMP. need to check higher in trump
    for (i=0; i<hand.length; i++)
	if (suit(hand[i])==trump) return false;
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
}
