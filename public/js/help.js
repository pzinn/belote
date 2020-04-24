commands = [
    ["help","","Show this message"],
    ["users","","Show the list of users in this room"],
    ["ready","[on/off]","Toggle your ready status"],
    ["bid","height suit","Bid"],
    ["partner","name","Pick your partner"],
    ["play","?","Play a card"],
    ["auto","[on/off/full]","Toggle autoplay"]
];

helpText="All commands must be preceded with @<br/>\n<ul>";
for (var i=0; i<commands.length; i++) {
    helpText+="<li><b>"+commands[i][0]+"</b> <i>"+commands[i][1]+"</i>: "+commands[i][2]+"</li>\n";
}

welcomeText="Welcome to Belote! Type @help for help";

// for server
if (typeof exports !== 'undefined') {
    exports.helpText=helpText;
    exports.welcomeText=welcomeText;
}
