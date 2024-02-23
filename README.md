# github-trello-card-events

Update cards in trello based on GitHub events

Note: Trello board name and GitHub repo name should match, to make moving cards and linking trello cards with PRs work
a bit smoother. The code could be modified to use an env variable, but if the names match, then this service can be used
for multiple boards/repos.

## GitHub Events

- [create](https://developer.github.com/v3/activity/events/types/#createevent)
- [pull_request](https://developer.github.com/v3/activity/events/types/#pullrequestevent) - open, reopened, closed

## Environment Variables

<!-- markdownlint-disable MD013 -->

| Name                    | Description                                                | Default Value |
| ----------------------- | ---------------------------------------------------------- | ------------- |
| PORT                    | Port to run the site on                                    | `1339`        |
| SLACK_WEBHOOK_URL       | URL for a Slack incoming webhook to post messages          |               |
| SLACK_ERROR_WEBHOOK_URL | URL for a Slack incoming webhook to post errors            |               |
| GITHUB_USER_AGENT       | Github API user agent                                      |               |
| GITHUB_TOKEN            | Github API token                                           |               |
| GITHUB_SECRET           | Secret used for validating requests                        |               |
| TRELLO_KEY              | Trello API key                                             |               |
| TRELLO_TOKEN            | Trello API token                                           |               |
| PR_OPEN_DEST_LIST       | Trello list for open pull requests pending review          | `Review`      |
| PR_MERGE_DEST_LIST      | Trello list for merged pull requests pending deployment    | `Done`        |
| PR_CLOSE_DEST_LIST      | Trello list for closed pull requests pending deployment    | `Doing`       |
| JIRA_BASE_URL           | Base url of jira instance. Eg: <https://foo.atlassian.net> |               |
| JIRA_EMAIL              | Jira email                                                 |               |
| JIRA_TOKEN              | Jira API token                                             |               |
| JIRA_KEY_PREFIX         | Prefix for jira issue                                      |               |
| PR_OPEN_DEST_STATUS     | Jira status for open pull requests pending review          | `Review`      |
| PR_MERGE_DEST_STATUS    | Jira status for merged pull requests pending deployment    | `Done`        |
| PR_CLOSE_DEST_STATUS    | Jira status for closed pull requests pending deployment    | `In Progress` |

## GitHub event webhook url query strings

| Name                 | Description                                                                                                                                                                  | Required                          | Default Value                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------- |
| boardName            | Trello board name                                                                                                                                                            | Yes - if boards is not defined    |                                                                        |
| trello_branch_prefix | Prefix for branch names to identify trello cards. Use when specifying boardName. Otherwise, only use `boards`                                                                | No                                |                                                                        |
| boards               | Boards and card prefixes. Key is board name, value is branch prefix. A branch prefix of `default` represents the board to use if the branch prefix does not match any others | Yes - if boardName is not defined |                                                                        |
| pr_merge_dest        | Destination trello list name for PR merge events                                                                                                                             | No                                | `process.env.PR_MERGE_DEST_LIST` if defined; otherwise `Done`          |
| pr_close_dest        | Destination trello list name for PR close events                                                                                                                             | No                                | `process.env.PR_CLOSE_DEST_LIST` if defined; otherwise `Doing`         |
| pr_open_dest         | Destination trello list name for PR open events                                                                                                                              | No                                | `process.env.PR_OPEN_DEST_LIST` if defined; otherwise `Review`         |
| jira_key_prefix      | Prefix for jira issue                                                                                                                                                        | No                                | `process.env.JIRA_KEY_PREFIX` if defined; otherwise ``                 |
| pr_merge_status      | Destination Jira status for PR merge events                                                                                                                                  | No                                | `process.env.PR_MERGE_DEST_STATUS` if defined; otherwise `Done`        |
| pr_close_status      | Destination Jira status for PR close events                                                                                                                                  | No                                | `process.env.PR_CLOSE_DEST_STATUS` if defined; otherwise `In Progress` |
| pr_open_status       | Destination Jira status for PR open events                                                                                                                                   | No                                | `process.env.PR_OPEN_DEST_STATUS` if defined; otherwise `Review`       |
| closeMilestone       | Immediately close created milestone when PR is merged                                                                                                                        | No                                | `true`                                                                 |
| createRelease        | Immediately create a release when PR is merged                                                                                                                               | No                                | `true`                                                                 |

<!-- markdownlint-enable MD013 -->

## Example

- <https://yoursite.com/github?boardName=foo>
- <https://yoursite.com/github?boards[foo>]=f-&boards[bar]=bar-&boards[my-default-board]=default

## Fly.io config

- Update `fly.toml` with a new name for the application
- Run `fly launch`
- Add environment variables and secrets to fly.io application settings
- Scale to multiple regions. Eg: `fly scale count 2 --region iad,den --max-per-region 1`
