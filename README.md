# github-trello-card-events
Update cards in trello based on GitHub events

Note: Trello board name and Github repo name should match, to make moving cards and linking trello cards with PRs work a bit smoother. The code could be modified to use an env variable, but if the names match, then this service can be used for multiple boards/repos.

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
REPOS_USING_MILESTONES | When deploying pull requests, they can be lumping into dated milestones reflecting what was included in each milestone. This is a comma-separated list of the Github repositories (within the user/org) that should create and utilize milestones.
LABELS_TO_COPY | Comma-separated list of all of the labels that should be copied from the Trello card to the Github pull request. (e.g. "bug,feature")
PR_OPEN_DEST_LIST | Trello list for open pull requests pending review | Review
PR_MERGE_DEST_LIST | Trello list for closed pull requests pending deployment | Deploy
DEPLOY_DEST_LIST | Trello list for closed pull requests that have been deployed | Validate
