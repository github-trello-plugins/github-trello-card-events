'use strict';

const co = require('co');
const app = require('express')();
const bodyParser = require('body-parser');
const Trello = require('node-trello');
const request = require('request-promise');

const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
const devKey = process.env.DEV_KEY;
const appToken = process.env.APP_TOKEN;
const trelloBoardName = process.env.TRELLO_BOARD_NAME;
const deploySlackChannel = process.env.DEPLOY_SLACK_CHANNEL;
const deploySlackUsername = process.env.DEPLOY_SLACK_USERNAME;
const trello = new Trello(devKey, appToken);

const listDestinationNameForDeployments = process.env.DEPLOY_DEST_LIST || 'Validate';

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
  const repoName = req.query.repo || req.query.board;

  co(async () => {
    // Not all repos will be using milestones to track deployments, so only set them up when needed
    // Close an open Milestone with a title of "Deploy Pending"
    await notifySlack({
      slackWebhookUrl,
      text: 'Updated datica with cards since the last datica deploy.',
      sendAsText: true,
      channel: deploySlackChannel,
      emoji: ':man-shrugging:',
      username: deploySlackUsername,
    });

    return res.json({
      ok: true,
      message: `Updated datica`,
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
