# github-trello-card-events
Update cards in trello based on GitHub events

Note: Trello board name and Github repo name should match, to make moving cards and linking trello cards with PRs work a bit smoother. The code could be modified to use an env variable, but if the names match, then this service can be used for multiple boards/repos.

## Github Events

* [create](https://developer.github.com/v3/activity/events/types/#createevent)
* [pull_request](https://developer.github.com/v3/activity/events/types/#pullrequestevent) - open, reopened, closed

## Environment Variables
Name | Description | Default Value
---- | ----------- | -------------
PORT | Port to run the site on | 1339
SLACK_WEBHOOK_URL | URL for a Slack incoming webhook to post messages
SLACK_ERROR_WEBHOOK_URL | URL for a Slack incoming webhook to post errors
TRELLO_KEY | Trello API key
TRELLO_TOKEN | Trello API token
GITHUB_USER_AGENT | Github API user agent
GITHUB_TOKEN | Github API token
GITHUB_SECRET | Secret used for validating requests
PR_OPEN_DEST_LIST | Trello list for open pull requests pending review | Review
PR_MERGE_DEST_LIST | Trello list for closed pull requests pending deployment | Deploy
PR_CLOSE_DEST_LIST | Trello list for closed pull requests pending deployment | Doing

## GitHub event webhook url query strings

Name | Description | Required
---- | ----------- | --------
boardName | Trello board name | Yes
dest | Destination trello list name | No
closeMilestone | Immediately close created milestone when PR is merged | No

