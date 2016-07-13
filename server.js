'use strict';

/* eslint-disable id-length */
const _ = require('lodash');
/* eslint-enable id-length */
const co = require('co');
const app = require('express')();
const bodyParser = require('body-parser');
const Trello = require('node-trello');

const devKey = process.env.DEV_KEY;
const appToken = process.env.APP_TOKEN;
const trello = new Trello(devKey, appToken);

function trelloGet(...args) {
  return new Promise((resolve, reject) => {
    trello.get(...args, (err, ...results) => {
      if (err) {
        return reject(err);
      }

      return resolve(...results);
    });
  });
}

function trelloPost(...args) {
  return new Promise((resolve, reject) => {
    trello.post(...args, (err, ...results) => {
      if (err) {
        return reject(err);
      }

      return resolve(...results);
    });
  });
}

function trelloPut(...args) {
  return new Promise((resolve, reject) => {
    trello.put(...args, (err, ...results) => {
      if (err) {
        return reject(err);
      }

      return resolve(...results);
    });
  });
}

const listDestinationNameForOpenedCards = process.env.PR_OPEN_DEST_LIST || 'Review';
const listDestinationNameForMergedCards = process.env.PR_MERGE_DEST_LIST || 'Deploy';
const listDestinationNameForDeployments = process.env.DEPLOY_DEST_LIST || 'Validate';
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

app.get('/deploy', (req, res) => {
  const boardName = req.param('board');

  co(function* deploy() {
    const boardAndList = yield getBoardAndList({
      boardName,
      listName: listDestinationNameForMergedCards,
    });
    const destinationList = _.find(boardAndList.board.lists, {
      name: listDestinationNameForDeployments,
    });

    if (!destinationList) {
      throw new Error(`Unable to find list (${listDestinationNameForDeployments}) in board: ${boardName}`);
    }

    const cards = yield trelloGet(`/1/lists/${boardAndList.list.id}/cards?fields=name`);

    for (const card of cards) {
      yield moveCard({
        board: boardAndList.board,
        list: destinationList,
        card,
        message: 'Deployed',
      });
    }

    return res.json({
      ok: true,
      message: `Moved ${cards.length} cards to ${listDestinationNameForDeployments}`,
      boardName,
    });
  }).catch((ex) => {
    return res.status(500).json({
      ok: false,
      err: ex,
      boardName,
      listName: listDestinationNameForDeployments,
    });
  });
});

app.post('/pr', (req, res) => {
  const pullRequest = req.body.pull_request;

  if (pullRequest) {

    sourceBranch = pullRequest.head.ref;
    destinationBranch = pullRequest.base.ref;

    co(function* pr() {
      if (sourceBranch && destinationBranch && destinationBranch !== "review") {

        // Trim the branch name of any possible leading/trailing whitespaces, replace any non alphanumeric characters
        // with '-', and convert it all to lowercase
        sourceBranch = sourceBranch.trim().replace(/\W+/g, '-').toLowerCase();

        // Next, we'll grab the number out of the branch, which is the card number
        // The card number is also the short ID of the Trello card (attribute is idShort)
        const cardNumberRegex = /\d+/g;
        const cardNumberMatches = cardNumberRegex.exec(sourceBranch);
        let cardNumber;
        if (cardNumberMatches) {
          cardNumber = cardNumberMatches[0];
        }

        // If we were successful in getting the card number, that means the pull request branch was named in such
        // a way that we are possibly able to find the corresponding card on Trello
        if (cardNumber) {
          const boardName = sourceBranch.slice(0, sourceBranch.length - cardNumber.length - 1);

          const action = req.body.action;
          // Now that we have all the information we can get, update the card on Trello

          if (['opened', 'closed', 'reopened'].includes(action)) {
            let message;
            let listName;
            if (action === 'opened' || action === 'reopened') {
              listName = listDestinationNameForOpenedCards;
              message = `Pull request opened by ${pullRequest.user.login}`;
            } else {
              listName = listDestinationNameForMergedCards;
              message = `Pull request merged by ${pullRequest.merged_by.login}`;
            }

            const boardAndList = yield getBoardAndList({
              boardName,
              listName,
            });

            const card = yield trelloGet(`/1/boards/${boardAndList.board.id}/cards/${cardNumber}`);

            const moveCardResult = yield moveCard({
              list: boardAndList.list,
              card,
              message,
            });

            return res.json({
              ok: true,
              message: moveCardResult,
              cardNumber,
              sourceBranch,
              destinationBranch,
              boardName,
            });
          }
        }
        return res.json({
          ok: true,
          ignored: true,
          sourceBranch,
          destinationBranch,
        });
      }
    }).catch((ex) => {
      return res.status(500).json({
        ok: false,
        err: ex,
        sourceBranch,
        destinationBranch,
      });
    });
  } else {
    return res.status(400).json({
      ok: false,
      err: new Error('Missing pull request body data'),
    });
  }
});

/**
 * Gets the board and list objects from the specified names
 * @param {Object} args - Arguments
 * @param {string} args.boardName - Name of the board
 * @param {string} args.listName - Name of the list to move the card to
 */
function* getBoardAndList(args) {
  const boards = yield trelloGet(`/1/members/me/boards?lists=all&fields=name`);

  const board = _.find(boards, (item) => {
    return item.name.toLowerCase() === args.boardName;
  });

  if (!board) {
    throw new Error(`Unable to find board: ${args.boardName}`);
  }

  const list = _.find(board.lists, {
    name: args.listName,
  });

  if (!list) {
    throw new Error(`Unable to find list (${args.listName}) in board: ${args.boardName}`);
  }

  return {
    board,
    list,
  };
}

/**
 * Upon certain pull request actions, this will move the card in the request into a
 * specified list
 *
 * @param {Object} args - Arguments
 * @param {Object} args.list - List to move the card to
 * @param {string} args.card - Card
 * @param {string} args.message - Message to add to the card on successful move
 * @returns {function<string>} Result message
 */
function* moveCard(args) {
    // If it's already in the list, do not attempt to move it
    if (args.card.idList === args.list.id) {
      return `Skipped. ${args.card.name} is already in ${args.list.name}`;
    }

    yield trelloPut(`/1/cards/${args.card.id}`, {idList: args.list.id});

    try {
      yield trelloPost(`/1/cards/${args.card.id}/actions/comments?text=${args.message}`);
    } catch (ex) {
      // Ignore this error - it's only the comment on the card that failed. Not the end of the world
    }

    return `Moved '${args.card.name}' into '${args.list.name}'`;
}
