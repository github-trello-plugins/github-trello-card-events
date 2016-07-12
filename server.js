'use strict';

/* eslint-disable id-length */
const _ = require('lodash');
/* eslint-enable id-length */
const app = require('express')();
const bodyParser = require('body-parser');
const Trello = require('node-trello');

const devKey = process.env.DEV_KEY;
const appToken = process.env.APP_TOKEN;
const trello = new Trello(devKey, appToken);

const listDestinationNameForOpenedCards = process.env.PR_OPEN_DEST_LIST || 'Review';
const listDestinationNameForMergedCards = process.env.PR_MERGE_DEST_LIST || 'Deploy';
let sourceBranch;
let destinationBranch;

app.use(bodyParser.json());

const server = app.listen(process.env.PORT || 1339, () => {
  console.log('Listening at http://%s:%s', server.address().address, server.address().port);
});

app.get('/', (req, res) => {
  return res.send(':)');
});

app.get('/healthcheck', (req, res) => {
  trello.get(`/1/members/me/boards?fields=name&filter=open`, (err, boards) => {
    if (err) {
      return res.status(500).json({
        ok: false,
        err,
      });
    }

    return res.json({
      ok: true,
      boards,
    });
  });
});

app.post('/', (req, res) => {
  const pullRequest = req.body.pull_request;

  if (pullRequest) {

    sourceBranch = pullRequest.head.ref;
    destinationBranch = pullRequest.base.ref;

    try {
      if (sourceBranch && destinationBranch && destinationBranch !== "review") {

        // Trim the branch name of any possible leading/trailing whitespaces, replace any non alphanumeric characters
        // with '-', and convert it all to lowercase
        sourceBranch = sourceBranch.trim().replace(/\W+/g, '-').toLowerCase();

        // Next, we'll grab the number out of the branch, which is the card number
        // The card number is also the short ID of the Trello card (attribute is idShort)
        const cardNumberRegex = /\d+/g;
        const cardNumber = cardNumberRegex.exec(sourceBranch)[0];

        // If we were successful in getting the card number, that means the pull request branch was named in such
        // a way that we are possibly able to find the corresponding card on Trello
        if (cardNumber) {

          const boardName = sourceBranch.slice(0, sourceBranch.length - cardNumber.length - 1);

          const action = req.body.action;
          // Now that we have all the information we can get, update the card on Trello

          switch (action) {
            case 'opened':
            {
              const githubUsername = pullRequest.user.login;
              return moveCard({
                boardName,
                listName: listDestinationNameForOpenedCards,
                cardNumber,
                githubUsername,
                merged: false,
              }, (err, message) => {
                if (err) {
                  return res.status(500).json({
                    ok: false,
                    err,
                    cardNumber,
                    sourceBranch,
                    destinationBranch,
                    boardName,
                  });
                }

                return res.json({
                  ok: true,
                  message,
                  cardNumber,
                  sourceBranch,
                  destinationBranch,
                  boardName,
                });
              });
            }
            case 'closed':
            {
              // Merged
              if (pullRequest.merged_at) {
                const githubUsername = pullRequest.merged_by.login;
                return moveCard({
                  boardName,
                  listName: listDestinationNameForMergedCards,
                  cardNumber,
                  githubUsername,
                  merged: true,
                }, (err, message) => {
                  if (err) {
                    return res.status(500).json({
                      ok: false,
                      err,
                      cardNumber,
                      sourceBranch,
                      destinationBranch,
                      boardName,
                    });
                  }

                  return res.json({
                    ok: true,
                    message,
                    cardNumber,
                    sourceBranch,
                    destinationBranch,
                    boardName,
                  });
                });
              }
              break;
            }
            case 'reopened':
            {
              const githubUsername = pullRequest.user.login;
              return moveCard({
                boardName,
                listName: listDestinationNameForOpenedCards,
                cardNumber,
                githubUsername,
                merged: false,
              }, (err, message) => {
                if (err) {
                  return res.status(500).json({
                    ok: false,
                    err,
                    cardNumber,
                    sourceBranch,
                    destinationBranch,
                    boardName,
                  });
                }

                return res.json({
                  ok: true,
                  message,
                  cardNumber,
                  sourceBranch,
                  destinationBranch,
                  boardName,
                });
              });
            }
            default:
              break;
          }
        }
      }
    } catch (err) {
      return res.status(500).json({
        ok: false,
        err,
        sourceBranch,
        destinationBranch,
      });
    }
  }

  return res.status(400).json({
    ok: false,
    err: 'Missing pull request body data',
  });
});

/**
 * Upon certain pull request actions, this will move the card in the request into a
 * specified list
 *
 * @param {Object} args - Arguments
 * @param {string} args.boardName - Name of the board
 * @param {string} args.listName - Name of the list to move the card to
 * @param {string} args.cardNumber - Card number
 * @param {string} args.githubUsername - github username
 * @param {boolean} args.merged - True if event is a merge, false if it is an open
 * @param {function} next - Callback
 * @param {function} [next.err] - Error
 * @param {function} [next.message] - Message
 */
function moveCard(args, next) {
  trello.get(`/1/members/me/boards?lists=all&fields=name`, (err, boards) => {
    if (err) {
      return next(err);
    }

    const board = _.find(boards, (item) => {
      return item.name.toLowerCase() === args.boardName;
    });

    if (!board) {
      return next(new Error(`Unable to find board: ${args.boardName}`));
    }

    const list = _.find(board.lists, {
      name: args.listName,
    });

    if (!list) {
      return next(new Error(`Unable to find list (${args.listName}) in board: ${args.boardName}`));
    }

    trello.get(`/1/boards/${board.id}/cards/${args.cardNumber}`, (err, card) => {
      if (err) {
        return next(err);
      }
      // If it's already in the list, do not attempt to move it
      if (card.idList === list.id) {
        return next(null, `Skipped. ${card.name} is already in ${list.name}`);
      }

      trello.put(`/1/cards/${card.id}`, {idList: list.id}, (err) => {
        if (err) {
          return next(err);
        }

        const status = args.merged ? 'merged' : 'opened';
        const message = `Pull request ${status} by ${args.githubUsername}`;
        trello.post(`/1/cards/${card.id}/actions/comments?text=${message}`, (err) => {
          return next(err, `Moved '${card.name}' into '${list.name}'`);
        });
      });
    });
  });
}
