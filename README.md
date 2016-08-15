# github-trello-card-events
Update cards in trello based on GitHub events

## Environment Variables
Name | Description | Default Value
---- | ----------- | -------------
PORT | Port to run the site on | 1339
SLACK_WEBHOOK_URL | URL for a Slack incoming webhook to post errors
SLACK_CHANNEL | Channel into which to post errors
DEV_KEY | Trello API dev key
APP_TOKEN | Trello API app token
GITHUB_USER_AGENT | Github API user agent
GITHUB_API_TOKEN | Github API token
GITHUB_USER | Github user or organization for these hooks
REPOS_USING_MILESTONES | When deploying pull requests, they can be lumping into dated milestones reflecting what was included in each milestone. This is a comma-separated list of the Github repositories (within the user/org) that should create and utilize milestones
PR_OPEN_DEST_LIST | Trello list for open pull requests pending review | Review
PR_MERGE_DEST_LIST | Trello list for closed pull requests pending deployment | Deploy
DEPLOY_DEST_LIST | Trello list for closed pull requests that have been deployed | Validate
