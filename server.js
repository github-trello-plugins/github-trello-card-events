var app = require('express')();
var bodyParser = require('body-parser');
var Trello = require('node-trello');

var devKey = process.env.DEV_KEY;
var appToken = process.env.APP_TOKEN;
var trello = new Trello(devKey, appToken);

var list = process.env.DESTINATION_LIST;
var branch;
var board;
var cardNumber;
var cardID;
var boardID;
var listID;
var listName;
var gitHubUser;

app.use(bodyParser.json());

var server = app.listen(process.env.PORT, function () {
  console.log('Listening at http://%s:%s', server.address().address, server.address().port);
});

app.post('/', function (req, res) {
  res.send({status: 'Received'});

  if (req.body.pull_request.merged_at) {

    var pullRequestTitle = req.body.pull_request.title;

    // Regex would most likely be best in this situation. Since the naming convention for pull requests is not set,
    // pull request names are inconsistent. All we know is that everything up to and including the first number is
    // a representation of the branch to be merged from.

    var branchRegex = /\D+\d+/g;
    try {
      // Grab everything up until and including the first number
      branch = branchRegex.exec(pullRequestTitle)[0];

      // If we were successful at getting the branch name, go ahead and continue
      if (branch) {

        // Trim the branch name of any possible leading/trailing whitespaces
        branch = branch.trim();

        // If there are any whitespaces in between words, replace the whitespaces in between the words
        // with a hyphen. Ex: 'this   is a    branch 50' will be 'this-is-a-branch-50'
        if (branch.indexOf(' ') >= 0) {
          branch = branch.replace(/\s+/g, '-');
        }

        // Convert it all to lowercase since that's how it most likely will appear on GitHub
        branch = branch.toLowerCase();

        // Next, we'll grab the number out of the branch, which is the card number
        // The card number is also the short ID of the Trello card (attribute is idShort)
        var cardNumberRegex = /\d+/g;
        cardNumber = cardNumberRegex.exec(branch)[0];

        // If we were successful in getting the card number, that means the pull request was named in such
        // a way that we are possibly able to find the corresponding card on Trello
        if (cardNumber) {

          gitHubUser = req.body.pull_request.user.login;
          board = branch.slice(0, branch.length - cardNumber.length - 1);
          console.log('Card #' + cardNumber + '\nBranch: ' + branch + '\nBoard: ' + board);

          var action = req.body.action;
          // Now that we have all the information we can get, update the card on Trello

          switch (action) {
            case 'assigned':
              break;
            case 'unassigned':
              break;
            case 'labeled':
              break;
            case 'unlabeled':
              break;
            case 'opened':
              break;
            case 'closed':
              moveCard();
              break;
            case 'reopened':
              break;
            case 'synchronized':
              break;
            // The created action is for when a pull request review comment event occurs
            case 'created':
              break;
          }
        }

      }

    } catch (error) {
      console.log('The pull request name is not formatted in a way to be found on Trello');
    }
  }
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
  trello.put('/1/cards/' + cardID, {idList: listID}, function (error, data) {
    if (error) {
      console.log(error);
    } else {
      console.log(data);
      commentOnCard(cardID, 'Merged by ' + gitHubUser);
    }
  });
}

/**
 * Upon certain pull request actions, this will move the card in the request into a
 * specified list
 *
 */
function moveCard() {
  trello.get('/1/members/me/boards?lists=all', function (error, boardsJSON) {
    if (error) {
      console.log(error);
    } else {
      var foundBoard = false;
      for (var i = 0; i < boardsJSON.length && !foundBoard; i++) {
        var boardJSON = boardsJSON[i];
        if (boardJSON.name === board) {
          foundBoard = true;
          boardID = boardJSON.id;

          var foundList = false;
          var listsJSON = boardJSON.lists;
          for (var j = 0; j < listsJSON.length && !foundList; j++) {
            var listJSON = listsJSON[j];
            if (listJSON.name === list) {
              foundList = true;

              listName = listJSON.name;
              listID = listJSON.id;
              trello.get('/1/boards/' + boardID + '/cards?limit=1000', function (error, cardsJSON) {
                if (error) {
                  console.log(error);
                } else {
                  var foundCard = false;
                  for (var k = 0; k < cardsJSON.length && !foundCard; k++) {
                    var cardJSON = cardsJSON[k];
                    if (cardJSON.idShort == cardNumber) {
                      foundCard = true;

                      cardID = cardJSON.id;
                      console.log('Placing \'' + cardJSON.name + '\' into \'' + listName + '\'');

                      putCardInList(cardID, listID);
                    }
                  }
                }
              });
            }
          }
        }
      }
    }
  });
}

function commentOnCard(cardID, message) {
  trello.post('/1/cards/' + cardID + '/actions/comments?text=' + message, function (error, data) {
    if (error) {
      console.log(error);
    } else {
      console.log(data);
    }
  });
}
