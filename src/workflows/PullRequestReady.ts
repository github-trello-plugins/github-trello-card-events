import type { BlockContent } from '../types/jira/AtlassianDataFormat/index.js';

import type { IWorkflowBaseParams } from './WorkflowBase.js';
import { WorkflowBase } from './WorkflowBase.js';

interface IPullRequestReadyParams extends IWorkflowBaseParams {
  destinationList: string;
  destinationStatus: string;
}

export class PullRequestReady extends WorkflowBase {
  public destinationList: string;

  public destinationStatus: string;

  public constructor(params: IPullRequestReadyParams) {
    super(params);

    this.destinationList = params.destinationList;
    this.destinationStatus = params.destinationStatus;
  }

  public async execute(): Promise<string> {
    if (!this.payload.pull_request) {
      throw new Error(`There were no pull_request details with payload: ${JSON.stringify(this.payload)}`);
    }

    const branchName = this.payload.pull_request.head.ref.trim().replace(/\W+/g, '-').toLowerCase();

    const logMessages = [`Starting PullRequestReady workflow\n-----------------`];

    const trelloCardResults = await this.getTrelloCardDetails(branchName, this.destinationList, logMessages);
    const jiraIssue = await this.getJiraIssue(branchName, logMessages);

    const urls: string[] = [];
    if (trelloCardResults) {
      logMessages.push(`\nFound Trello card number (${trelloCardResults.card.idShort}) in branch: ${branchName}`);
      urls.push(trelloCardResults.card.shortUrl);
    }

    let jiraIssueUrl: string | undefined;
    if (jiraIssue) {
      logMessages.push(`\nFound JIRA issue (${jiraIssue.key}) in branch: ${branchName}`);
      jiraIssueUrl = `${this.jira?.baseUrl ?? ''}/browse/${jiraIssue.key}`;
      urls.push(jiraIssueUrl);
    }

    if (!trelloCardResults && !jiraIssue) {
      logMessages.push(`\nCould not find trello card or jira issue\n${JSON.stringify(this.payload)}`);
      throw new Error(logMessages.join(''));
    }

    // Update issue with card link and apply labels
    let body = this.payload.pull_request.body ?? '';
    // eslint-disable-next-line security/detect-non-literal-regexp
    const hasFooterLinksRegEx = new RegExp(`(?:^|---\\n)(?:${urls.join('|').replaceAll('/', '\\/')})$`, 'gim');

    if (body && !hasFooterLinksRegEx.test(body)) {
      body += '\n\n---';
    }

    if (jiraIssueUrl && !body.includes(jiraIssueUrl)) {
      if (body) {
        body += '\n';
      }

      body += jiraIssueUrl;
      logMessages.push(`\nAdding jira issue link to PR body`);
    }

    if (trelloCardResults && !body.includes(trelloCardResults.card.shortUrl)) {
      if (body) {
        body += '\n';
      }

      body += trelloCardResults.card.shortUrl;
      logMessages.push(`\nAdding card shortUrl to PR body`);
    }

    const labels = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    for (const label of this.payload.pull_request.labels ?? []) {
      if (label.name) {
        labels.add(label.name);
      }
    }

    try {
      if (trelloCardResults?.card.labels.length) {
        logMessages.push(`\nGetting labels for repository... `);
        const githubRepoLabels = await this.github.issues.listLabelsForRepo({
          owner: this.repo.owner,
          repo: this.repo.repo,
        });
        logMessages.push('Done!');

        for (const label of trelloCardResults.card.labels) {
          const labelName = label.name.toLowerCase();
          for (const githubLabel of githubRepoLabels.data) {
            if (labelName === githubLabel.name.toLowerCase()) {
              logMessages.push(`\nAdding label: ${githubLabel.name}`);
              labels.add(githubLabel.name);
              break;
            }
          }
        }
      }
    } catch (ex) {
      // Not critical if assigning labels fails
      if (ex instanceof Error && ex.stack) {
        logMessages.push(`\n${ex.stack}`);
      }

      console.error(ex);
    }

    try {
      logMessages.push(`\nUpdating PR with card url and labels... `);
      await this.github.issues.update({
        owner: this.repo.owner,
        repo: this.repo.repo,
        issue_number: this.payload.pull_request.number,
        body,
        labels: Array.from(labels),
      });
      logMessages.push('Done!');
    } catch (ex) {
      // Not critical if updating GitHub PR fails
      if (ex instanceof Error && ex.stack) {
        logMessages.push(`\n${ex.stack}`);
      }

      console.error(ex);
    }

    let comment: string | undefined;
    const jiraComment: BlockContent[] = [];
    if (this.payload.sender) {
      comment = `Pull request ${this.payload.action ?? 'opened'} by [${this.payload.sender.login}](${this.payload.sender.html_url})`;

      jiraComment.push({
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: `Pull request ${this.payload.action ?? 'opened'} by `,
          },
          {
            type: 'text',
            text: this.payload.sender.login,
            marks: [
              {
                type: 'link',
                attrs: {
                  href: this.payload.sender.html_url,
                },
              },
            ],
          },
        ],
      });
    } else {
      comment = `Pull request ${this.payload.action ?? 'opened'}!`;
      jiraComment.push({
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: `Pull request ${this.payload.action ?? 'opened'}!`,
          },
        ],
      });
    }

    if (this.payload.pull_request.html_url) {
      comment += ` - ${this.payload.pull_request.html_url}`;
      jiraComment.push({
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: this.payload.pull_request.html_url,
                    marks: [
                      {
                        type: 'link',
                        attrs: {
                          href: this.payload.pull_request.html_url,
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });
    }

    if (this.jira && jiraIssue) {
      logMessages.push(`\nAdding PR opened comment to jira issue: ${jiraIssue.key}... `);

      const updateJiraIssueResult = await this.updateJiraIssue({
        issueIdOrKey: jiraIssue.key,
        status: this.destinationStatus,
        comment: jiraComment,
      });

      logMessages.push(`\n${updateJiraIssueResult}`);
    }

    if (trelloCardResults) {
      logMessages.push(`\nAdding PR opened comment to trello card: ${trelloCardResults.card.id}... `);
      const moveCardResult = await this.moveCard({
        ...trelloCardResults,
        comment,
      });

      logMessages.push(`\n${moveCardResult}`);
    }

    logMessages.push('\nDone!');

    return logMessages.join('');
  }
}
