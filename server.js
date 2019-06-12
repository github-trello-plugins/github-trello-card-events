'use strict';

const _ = require('lodash');
const co = require('co');
const app = require('express')();
const bodyParser = require('body-parser');
const Trello = require('node-trello');
const request = require('request-promise');
const octokit = require('@octokit/rest');
const moment = require('moment-timezone');

const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
const slackChannel = process.env.SLACK_CHANNEL;
const devKey = process.env.DEV_KEY;
const appToken = process.env.APP_TOKEN;
const githubOwner = process.env.GITHUB_USER;
const trelloBoardName = process.env.TRELLO_BOARD_NAME;
const deployWebhookUrl = process.env.DEPLOY_WEBHOOK_URL;
const deployWebhookUsername = process.env.DEPLOY_WEBHOOK_USERNAME;
const deployWebhookPassword = process.env.DEPLOY_WEBHOOK_PASSWORD;
const deploySlackMessage = process.env.DEPLOY_SLACK_MESSAGE;
const deploySlackChannel = process.env.DEPLOY_SLACK_CHANNEL;
const deploySlackUsername = process.env.DEPLOY_SLACK_USERNAME;
const deploySlackNotifyUser = process.env.DEPLOY_SLACK_NOTIFY_USER || '@developers';
const deploySlackNotifyLabels = (process.env.DEPLOY_SLACK_NOTIFY_LABELS || '')
  .split(',')
  .map((label) => label.toLowerCase());
const libratoAnnotationUrl = process.env.LIBRATO_ANNOTATION_URL;
const libratoUsername = process.env.LIBRATO_USERNAME;
const libratoToken = process.env.LIBRATO_TOKEN;
const labelsToCopy = (process.env.LABELS_TO_COPY || '').split(',');
const trello = new Trello(devKey, appToken);
const github = octokit({
  protocol: 'https',
  host: 'api.github.com',
  headers: {
    'user-agent': process.env.GITHUB_USER_AGENT,
  },
  auth: `token ${process.env.GITHUB_API_TOKEN}`,
});

// NOTE: These trello functions are defined becuase the trello class didn't support promises natively
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
  const repoName = req.param('repo') || req.param('board');

  co(async () => {
    // Not all repos will be using milestones to track deployments, so only set them up when needed
    let milestoneUrl;
    const now = moment().tz('America/Chicago');
    const releaseName = now.format('YYYY-MM-DD hh:mma');
    const releaseTag = now.format('YYYY-MM-DDTHHmm');
    // Close an open Milestone with a title of "Deploy Pending"
    try {
      const openMilestones = await github.issues.listMilestonesForRepo({
        owner: githubOwner,
        repo: repoName,
        state: 'open',
      });
      const pendingMilestone = _.find(openMilestones.data || [], {
        title: 'Deploy Pending',
      });
      if (pendingMilestone) {
        milestoneUrl = pendingMilestone.html_url;
        await github.issues.updateMilestone({
          owner: githubOwner,
          repo: repoName,
          number: pendingMilestone.number,
          title: `Deploy ${releaseName}`,
          state: 'closed',
          due_on: new Date().toISOString(),
        });
      }
    } catch (ex) {
      await notifySlackOfCardError({
        note: '/deploy',
        error: ex,
      });
    }

    const boardAndList = await getBoardAndList({
      boardName: trelloBoardName,
      listName: listDestinationNameForMergedCards,
    });
    const destinationList = _.find(boardAndList.board.lists, {
      name: listDestinationNameForDeployments,
    });

    if (!destinationList) {
      throw new Error(`Unable to find list (${listDestinationNameForDeployments}) in board: ${trelloBoardName}`);
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

      await request.post(webhookRequestParams).catch(() => {
        // TODO: Maybe log this in the future
      });
    }

    const cards = await trelloGet(`/1/lists/${boardAndList.list.id}/cards?fields=name,idList,labels,shortUrl`);

    let cardsInMilestone = cards;
    // Check to see that the card has the milestone url in it's attachments array.
    // Milestone url is added to the card attachments array when the PR is merged
    if (milestoneUrl) {
      cardsInMilestone = [];
      for (const card of cards) {
        // eslint-disable-next-line no-await-in-loop
        const attachments = await trelloGet(`/1/cards/${card.id}/attachments?fields=id,url`);
        if (!_.some(attachments)) {
          cardsInMilestone.push(card);
        }

        for (const attachment of attachments) {
          if (attachment.url === milestoneUrl) {
            cardsInMilestone.push(card);
            break;
          }
        }
      }
    }

    // Notify slack of deployment, with summary of cards being deployed
    let slackUpdateText = deploySlackMessage || `*Deployed updates (${repoName}):*`;
    let githubReleaseText = '';
    const labelsToNotify = [];
    for (const card of cardsInMilestone) {
      slackUpdateText += `\n+ ${card.name || JSON.stringify(card)}`;

      if (githubReleaseText) {
        githubReleaseText += '\n';
      }

      githubReleaseText += `* [${card.name || JSON.stringify(card)}](${card.shortUrl})`;

      for (const label of card.labels) {
        if (deploySlackNotifyLabels.includes(label.name.toLowerCase()) && !labelsToNotify.includes(label.name)) {
          labelsToNotify.push(label.name);
        }
      }
    }

    try {
      await github.repos.createRelease({
        owner: githubOwner,
        repo: repoName,
        tag_name: releaseTag,
        name: releaseTag,
        body: githubReleaseText,
      });
    } catch (ex) {
      await notifySlackOfCardError({
        note: 'github.createRelease',
        error: ex,
      });
    }

    if (libratoAnnotationUrl && libratoUsername && libratoToken) {
      await request
        .post({
          uri: libratoAnnotationUrl,
          method: 'POST',
          auth: {
            user: libratoUsername,
            pass: libratoToken,
          },
          json: {
            title: 'Deployment',
            description: slackUpdateText,
          },
          timeout: 5000,
        })
        .catch((ex) => {
          co(function* sendErrorToSlack() {
            yield notifySlackOfCardError({
              note: 'librato annotation',
              error: ex,
            });
          });
        });
    }

    if (labelsToNotify.length) {
      slackUpdateText += `\n------------------\n${deploySlackNotifyUser}: ${labelsToNotify.join(', ')}`;
    }

    await notifySlack({
      slackWebhookUrl,
      text: slackUpdateText,
      sendAsText: true,
      channel: deploySlackChannel,
      emoji: ':heart:',
      username: deploySlackUsername,
    });

    for (const card of cardsInMilestone) {
      // eslint-disable-next-line no-await-in-loop
      await moveCard({
        board: boardAndList.board,
        list: destinationList,
        card,
        message: 'Deployed',
      });
    }

    return res.json({
      ok: true,
      message: `Moved ${cards.length} cards to ${listDestinationNameForDeployments}`,
      board: trelloBoardName,
      repo: repoName,
    });
  }).catch((ex) => {
    return res.status(500).json({
      ok: false,
      err: {
        message: ex.message,
        stack: ex.stack,
      },
      boardName: trelloBoardName,
      listName: listDestinationNameForDeployments,
    });
  });
});

// Handle when a PR is updated - Create a link to the PR on the card and add a link to the card to the PR description
// Create "Deploy Pending" Milestone if there isn't one
app.post('/pr', (req, res) => {
  const pullRequest = req.body.pull_request;

  if (pullRequest) {
    sourceBranch = pullRequest.head.ref;
    destinationBranch = pullRequest.base.ref;

    co(function* pr() {
      if (sourceBranch && destinationBranch && destinationBranch !== 'review') {
        // Trim the branch name of any possible leading/trailing whitespaces, replace any non alphanumeric characters
        // with '-', and convert it all to lowercase
        sourceBranch = sourceBranch
          .trim()
          .replace(/\W+/g, '-')
          .toLowerCase();

        // Next, we'll grab the number out of the branch, which is the card number
        // The card number is also the short ID of the Trello card (attribute is idShort)
        const cardNumberRegex = /\d+/g;
        const cardNumberMatches = cardNumberRegex.exec(sourceBranch);
        let cardNumber;
        if (cardNumberMatches) {
          [cardNumber] = cardNumberMatches;
        }

        // If we were successful in getting the card number, that means the pull request branch was named in such
        // a way that we are possibly able to find the corresponding card on Trello
        if (cardNumber) {
          const repo = pullRequest.head.repo.name;
          const boardName = trelloBoardName || pullRequest.head.repo.name; //sourceBranch.slice(0, sourceBranch.length - cardNumber.length - 1);

          let boardAndList;
          let card;

          const { action } = req.body;
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

              const openMilestones = yield github.issues.listMilestonesForRepo({
                owner: githubOwner,
                repo,
                state: 'open',
              });
              let pendingMilestone = _.find(openMilestones.data || [], {
                title: 'Deploy Pending',
              });
              if (!pendingMilestone) {
                pendingMilestone = (yield github.issues.createMilestone({
                  owner: githubOwner,
                  repo,
                  title: 'Deploy Pending',
                })).data;
              }

              yield github.issues.update({
                owner: githubOwner,
                repo,
                number: req.body.number,
                milestone: pendingMilestone.number,
              });

              boardAndList = yield getBoardAndList({
                boardName,
                listName,
              });

              card = yield trelloGet(`/1/boards/${boardAndList.board.id}/cards/${cardNumber}`);

              // Update the trello card with the milestone url
              if (card) {
                try {
                  yield trelloPost(
                    `/1/cards/${card.id}/attachments?name=github-milestone&url=${pendingMilestone.html_url}`
                  );
                } catch (ex) {
                  yield notifySlackOfCardError({
                    note: 'Update trello with milestone url',
                    error: ex,
                  });
                }
              }
            }

            if (!boardAndList) {
              boardAndList = yield getBoardAndList({
                boardName,
                listName,
              });

              card = yield trelloGet(`/1/boards/${boardAndList.board.id}/cards/${cardNumber}`);
            }

            if (card) {
              // Update labels and add link to Trello card in the pull request
              try {
                let body = pullRequest.body || '';
                if (!body.includes(card.shortUrl)) {
                  if (body) {
                    body += '\n\n';
                  }

                  body += card.shortUrl;
                }

                // Get labels applied to Trello card and filter them down to the ones we care about in Github
                const labels = card.labels
                  .map((trelloLabel) => trelloLabel.name.toLowerCase())
                  .filter((trelloLabelName) => labelsToCopy.includes(trelloLabelName));

                yield github.issues.update({
                  owner: githubOwner,
                  repo,
                  number: pullRequest.number,
                  body,
                  labels,
                });
              } catch (ex) {
                yield notifySlackOfCardError({
                  note: 'Update labels on PR from card',
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
          note: '/pr',
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
async function getBoardAndList(args) {
  const boards = await trelloGet(`/1/members/me/boards?lists=all&fields=name`);

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
    throw new Error(`Unable to find list (${args.listName}) in board: ${board}`);
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
async function moveCard(args) {
  // If it's already in the list, do not attempt to move it
  if (args.card.idList === args.list.id) {
    return `Skipped. ${args.card.name} is already in ${args.list.name}`;
  }

  await trelloPut(`/1/cards/${args.card.id}`, {
    idList: args.list.id,
  });

  try {
    await trelloPost(`/1/cards/${args.card.id}/actions/comments?text=${args.message}`);
  } catch (ex) {
    // Ignore this error - it's only the comment on the card that failed. Not the end of the world
  }

  return `Moved '${args.card.name}' into '${args.list.name}'`;
}

/**
 * Sends a notification to a Slack channel about an error
 *
 * @param {Object} args Arguments
 * @param {string} args.note - Note related to what threw the error
 * @param {Error} args.error - Error returned from a request
 * @param {string} [args.card] - Card ({board}-{card number}) that is being moved
 */
function notifySlackOfCardError(args) {
  if (!slackWebhookUrl) {
    return;
  }

  let text = `:poop: ${args.note || ''}`;
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
    payload.attachments = [
      {
        fallback: args.text,
        text: args.text,
        mrkdwn_in: ['text'],
        color: args.borderColor,
      },
    ];
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
