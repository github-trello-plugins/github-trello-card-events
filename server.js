'use strict';

/* eslint-disable id-length */
const _ = require('lodash');
/* eslint-enable id-length */
const co = require('co');
const app = require('express')();
const bodyParser = require('body-parser');
const Trello = require('node-trello');
const request = require('request-promise');
const GitHubApi = require('github');
const moment = require('moment-timezone');

const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
const slackChannel = process.env.SLACK_CHANNEL;
const devKey = process.env.DEV_KEY;
const appToken = process.env.APP_TOKEN;
const user = process.env.GITHUB_USER;
const deployWebhookUrl = process.env.DEPLOY_WEBHOOK_URL;
const deployWebhookUsername = process.env.DEPLOY_WEBHOOK_USERNAME;
const deployWebhookPassword = process.env.DEPLOY_WEBHOOK_PASSWORD;
const deploySlackMessage = process.env.DEPLOY_SLACK_MESSAGE || '*Deployed updates:*';
const deploySlackChannel = process.env.DEPLOY_SLACK_CHANNEL;
const deploySlackUsername = process.env.DEPLOY_SLACK_USERNAME;
const deploySlackNotifyUser = process.env.DEPLOY_SLACK_NOTIFY_USER || '@developers';
const deploySlackNotifyLabels = (process.env.DEPLOY_SLACK_NOTIFY_LABELS || '').split(',').map((label) => label.toLowerCase());
const libratoAnnotationUrl = process.env.LIBRATO_ANNOTATION_URL;
const libratoUsername = process.env.LIBRATO_USERNAME;
const libratoToken = process.env.LIBRATO_TOKEN;
const reposUsingMilestones = (process.env.REPOS_USING_MILESTONES || '').split(',');
const labelsToCopy = (process.env.LABELS_TO_COPY || '').split(',');
const trello = new Trello(devKey, appToken);
const github = new GitHubApi({
  protocol: "https",
  host: "api.github.com",
  headers: {
    "user-agent": process.env.GITHUB_USER_AGENT,
  },
});
github.authenticate({
  type: "oauth",
  token: process.env.GITHUB_API_TOKEN,
});

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

function* githubClosePendingMilestone(repo) {
  const openMilestones = yield githubGetMilestones(repo, 'open');
  const pendingMilestone = _.find(openMilestones, ['title', 'Deploy Pending']);
  if (pendingMilestone) {
    return new Promise((resolve, reject) => {
      // Set title to current date/time, and set status to closed
      github.issues.updateMilestone({
        user,
        repo,
        number: pendingMilestone.number,
        title: `Deploy ${moment().tz("America/Chicago").format('YYYY-MM-DD hh:mma')}`,
        state: 'closed',
        due_on: new Date(),
      }, (err, milestone) => {
        if (err) {
          return reject(err);
        }

        return resolve(milestone);
      });
    });
  }
}

function* githubAssignIssueToPendingMilestone(repo, prNumber) {
  const openMilestones = yield githubGetMilestones(repo, 'open');
  let pendingMilestone = _.find(openMilestones, ['title', 'Deploy Pending']);
  if (!pendingMilestone) {
    pendingMilestone = yield githubCreatePendingMilestone(repo);
  }

  return new Promise((resolve) => {
    github.issues.edit({
      user,
      repo,
      number: prNumber,
      milestone: pendingMilestone.number,
    }, (err, issue) => {
      if (err) {
        // Just notify and continue
        co(function* sendErrorToSlack() {
          yield notifySlackOfCardError({
            error: err,
          });
        });
      }

      return resolve(issue);
    });
  });
}

function githubGetMilestones(repo, state) {
  return new Promise((resolve) => {
    github.issues.getMilestones({
      user,
      repo,
      state: state || 'all',
    }, (err, milestones) => {
      if (err) {
        // Just notify and continue
        co(function* sendErrorToSlack() {
          yield notifySlackOfCardError({
            error: err,
          });
        });
      }

      return resolve(milestones);
    });
  });
}

function githubCreatePendingMilestone(repo) {
  return new Promise((resolve) => {
    github.issues.createMilestone({
      user,
      repo,
      title: 'Deploy Pending',
    }, (err, milestone) => {
      if (err) {
        // Just notify and continue
        co(function* sendErrorToSlack() {
          yield notifySlackOfCardError({
            error: err,
          });
        });
      }

      return resolve(milestone);
    });
  });
}

function githubUpdateIssueFromTrelloCard(repo, issue, trelloCard) {
  return new Promise((resolve) => {
    let body = issue.body || '';
    if (!body.includes(trelloCard.shortUrl)) {
      if (body) {
        body += '\n\n';
      }

      body += trelloCard.shortUrl;
    }

    // Get labels applied to Trello card and filter them down to the ones we care about in Github
    const labels = trelloCard.labels.map((trelloLabel) => {
      return trelloLabel.name.toLowerCase();
    }).filter((trelloLabelName) => {
      return labelsToCopy.includes(trelloLabelName);
    });

    github.issues.edit({
      user,
      repo,
      number: issue.number,
      body,
      labels,
    }, (err, issue) => {
      if (err) {
        // Just notify and continue
        co(function* sendErrorToSlack() {
          yield notifySlackOfCardError({
            error: err,
          });
        });
      }

      return resolve(issue);
    });
  });
}

const listDestinationNameForOpenedCards = process.env.PR_OPEN_DEST_LIST || 'Review';
const listDestinationNameForMergedCards = process.env.PR_MERGE_DEST_LIST || 'Deploy';
const listDestinationNameForDoingCards = process.env.PR_CLOSE_DEST_LIST || 'Doing';
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
        err: {
          message: err.message,
          stack: err.stack,
        },
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
    // Not all repos will be using milestones to track deployments, so only set them up when needed
    if (reposUsingMilestones.includes(boardName)) {
      try {
        yield githubClosePendingMilestone(boardName);
      } catch (ex) {
        yield notifySlackOfCardError({
          error: ex,
        });
      }
    }
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

    if (deployWebhookUrl) {
      const webhookRequestParams = {
        uri: deployWebhookUrl,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      };

      if (deployWebhookUsername) {
        webhookRequestParams.auth = {
          user: deployWebhookUsername,
          pass: deployWebhookPassword,
        };
      }

      yield request.post(webhookRequestParams).catch(() => {
        // TODO: Maybe log this in the future
      });
    }

    const cards = yield trelloGet(`/1/lists/${boardAndList.list.id}/cards?fields=name,idList,labels`);

    // Notify slack of deployment, with summary of cards being deployed
    let slackUpdateText = deploySlackMessage;
    const labelsToNotify = [];
    for (const card of cards) {
      slackUpdateText += `\n+ ${card.name || JSON.stringify(card)}`;

      for (const label of card.labels) {
        if (deploySlackNotifyLabels.includes(label.name.toLowerCase()) && !labelsToNotify.includes(label.name)) {
          labelsToNotify.push(label.name);
        }
      }
    }

    if (libratoAnnotationUrl && libratoUsername && libratoToken) {
      yield request.post({
        uri: libratoAnnotationUrl,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        auth: {
          user: libratoUsername,
          pass: libratoToken,
        },
        title: `Deployment: ${moment().tz("America/Chicago").format('YYYY-MM-DD hh:mma')}`,
        description: slackUpdateText,
        timeout: 5000,
      }).catch((ex) => {
        co(function* sendErrorToSlack() {
          yield notifySlackOfCardError({
            error: ex,
          });
        });
      });
    }

    if (labelsToNotify.length) {
      slackUpdateText += `\n------------------\n${deploySlackNotifyUser}: ${labelsToNotify.join(', ')}`;
    }

    yield notifySlack({
      slackWebhookUrl,
      text: slackUpdateText,
      sendAsText: true,
      channel: deploySlackChannel,
      emoji: ':heart:',
      username: deploySlackUsername,
    });

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
      err: {
        message: ex.message,
        stack: ex.stack,
      },
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
              if (pullRequest.html_url) {
                message += ` - ${pullRequest.html_url}`;
              }
            } else if (action === 'closed' && !pullRequest.merged_at) {
              listName = listDestinationNameForDoingCards;
              message = 'Pull request closed';
              if (req.body.sender && req.body.sender.login) {
                message += ` by ${req.body.sender.login}`;
              }
            } else {
              listName = listDestinationNameForMergedCards;
              message = `Pull request merged by ${pullRequest.merged_by.login}`;

              // Not all repos will be using milestones to track deployments, so only set them up when needed
              if (reposUsingMilestones.includes(boardName)) {
                yield githubAssignIssueToPendingMilestone(boardName, req.body.number);
              }
            }

            const boardAndList = yield getBoardAndList({
              boardName,
              listName,
            });

            const card = yield trelloGet(`/1/boards/${boardAndList.board.id}/cards/${cardNumber}`);

            if (card) {
              // Update labels and add link to Trello card in the pull request
              try {
                yield githubUpdateIssueFromTrelloCard(boardName, pullRequest, card);
              } catch (ex) {
                yield notifySlackOfCardError({
                  error: ex,
                  card: sourceBranch,
                });
              }
            }

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
      co(function* sendErrorToSlack() {
        return yield notifySlackOfCardError({
          error: ex,
          card: sourceBranch,
        });
      });

      return res.status(500).json({
        ok: false,
        err: {
          message: ex.message,
          stack: ex.stack,
        },
        sourceBranch,
        destinationBranch,
      });
    });
  } else {
    return res.status(400).json({
      ok: false,
      err: {
        message: 'Missing pull request body data',
        stack: new Error().stack,
      },
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
 * @param {Object} args.card - Card
 * @param {string} args.card.id - Id of the card
 * @param {string} args.card.idList - Id of the card's list
 * @param {string} args.card.name - Name of the card
 * @param {string} args.message - Message to add to the card on successful move
 * @returns {string} Result message
 */
function* moveCard(args) {
  // If it's already in the list, do not attempt to move it
  if (args.card.idList === args.list.id) {
    return `Skipped. ${args.card.name} is already in ${args.list.name}`;
  }

  yield trelloPut(`/1/cards/${args.card.id}`, {
    idList: args.list.id,
  });

  try {
    yield trelloPost(`/1/cards/${args.card.id}/actions/comments?text=${args.message}`);
  } catch (ex) {
    // Ignore this error - it's only the comment on the card that failed. Not the end of the world
  }

  return `Moved '${args.card.name}' into '${args.list.name}'`;
}

/**
 * Sends a notification to a Slack channel about an error
 *
 * @param {Object} args Arguments
 * @param {Error} args.error - Error returned from a request
 * @param {string} [args.card] - Card ({board}-{card number}) that is being moved
 */
function notifySlackOfCardError(args) {
  if (!slackWebhookUrl) {
    return;
  }

  let text = ':poop:';
  if (args.card) {
    text = `Unable to move \`${args.card}\``;
  }

  const simpleError = {
    message: args.error.message,
    stack: args.error.stack || new Error().stack,
  };

  text += `\n\`\`\`\n${JSON.stringify(simpleError, null, 2)}\n\`\`\``;

  return notifySlack({
    slackWebhookUrl,
    text,
    borderColor: 'danger',
    emoji: ':bug:',
    channel: slackChannel,
  });
}

/**
 * Sends message to slack channel
 * @param {Object} args
 * @param {string} args.slackWebhookUrl
 * @param {string} args.text - Message text
 * @param {boolean} [args.sendAsText] - If true, send the message as regular text; otherwise send the message as an attachment
 * @param {string} [args.borderColor] - Color of the border along the left side of the message. Can either be one of good, warning, danger, or any hex color code (eg. #439FE0)
 * @param {string} [args.channel] - Slack channel to post message. If omitted, the message will be posted in the channel configured with the webhook
 * @param {string} [args.emoji] - Slack emoji icon for the message
 * @param {string} [args.username] - Slack username to show with message
 * @returns {Promise} Request promise
 */
function notifySlack(args) {
  const payload = {
    username: args.username || 'trello card events',
    icon_emoji: args.emoji,
    channel: args.channel || '',
  };

  if (args.sendAsText) {
    payload.text = args.text;
  } else {
    payload.attachments = [{
      fallback: args.text,
      text: args.text,
      mrkdwn_in: ['text'],
      color: args.borderColor,
    }];
  }

  const options = {
    uri: slackWebhookUrl,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    form: `payload=${encodeURIComponent(JSON.stringify(payload))}`,
    timeout: 10000,
  };

  return request(options).catch(() => {
    // TODO: Maybe log this in the future
  });
}
