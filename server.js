var app = require('express')();
var bodyParser = require('body-parser');
var Trello = require('node-trello');

var devKey = process.env.DEV_KEY;
var appToken = process.env.APP_TOKEN;
var trello = new Trello(devKey, appToken);

app.use(bodyParser.json());
app.listen(process.env.PORT);

app.post('/', function (req, res) {
    console.log(req.body);
    res.send({status: 'I have received the message.'});
    var pullRequestTitle = req.body.pull_request.title;
// Assume the title will be formatted [REPOSITORY_NAME]-[CARD_NUMBER]: [DESCRIPTION]
    var cardNum = pullRequestTitle.split('-').pop().split(':')[0];
    console.log(cardNum);
    // TODO: figure out what board the card is in, get the card ID, and get the ID of the
    // TODO: board we want to move the card to
    var cardID = '';
    var listID = '';
    putCardInList(cardID, listID);
});

/**
 *
 * Moves the card with the specified ID from its current list to the list with the
 * specified ID.
 *
 * @param {string} cardID - ID of the Trello card
 * @param {string} listID - ID of the Trello list
 */
function putCardInList(cardID, listID) {
    trello.put('/1/cards/' + cardID, {idList: listID}, function (err, data) {
        if (err) {
            console.log(err);
        }
        console.log(data);
    });
}
