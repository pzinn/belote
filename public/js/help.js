commands = [
    ["help","Show this message"],
    ["users","Show the list of users in this room"],
    ["ready","Toggle your ready status"],
    ["bid","Bid"],
    ["partner","Pick your partner"],
    ["play","Play a card (slightly buggy atm)"]
];

helpText="All commands must be preceded with @<br/>\n<ul>";
for (var i=0; i<commands.length; i++) {
    helpText+="<li><b>"+commands[i][0]+"</b>: "+commands[i][1]+"</li>\n";
}

welcomeText="Welcome to Belote! Type @help for help";

// for server
if (typeof exports !== 'undefined') {
    exports.helpText=helpText;
    exports.welcomeText=welcomeText;
}
