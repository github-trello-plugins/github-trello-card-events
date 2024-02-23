import type { Endpoints } from '@octokit/types';

import type { BlockContent } from '../types/jira/AtlassianDataFormat/index.js';

import type { IWorkflowBaseParams } from './WorkflowBase.js';
import { WorkflowBase } from './WorkflowBase.js';

type IssuesCreateMilestoneResponse = Endpoints['POST /repos/{owner}/{repo}/milestones']['response']['data'];

interface IPullRequestMergedParams extends IWorkflowBaseParams {
  destinationList: string;
  destinationStatus: string;
  closeMilestone: boolean;
  createRelease: boolean;
}

interface ICreateMilestoneParams {
  due: string;
  title?: string;
  description?: string;
}

export class PullRequestMerged extends WorkflowBase {
  public destinationList: string;

  public destinationStatus: string;

  public createRelease: boolean;

  public closeMilestone: boolean;

  public constructor(params: IPullRequestMergedParams) {
    super(params);

    this.destinationList = params.destinationList;
    this.destinationStatus = params.destinationStatus;
    this.createRelease = params.createRelease;
    this.closeMilestone = params.closeMilestone;
  }

  public async execute(): Promise<string> {
    if (!this.payload.pull_request) {
      throw new Error(`There were no pull_request details with payload: ${JSON.stringify(this.payload)}`);
    }

    const branchName = this.payload.pull_request.head.ref.trim().replace(/\W+/g, '-').toLowerCase();

    const logMessages = [`Starting PullRequestMerged workflow\n-----------------`];

    const trelloCardResults = await this.getTrelloCardDetails(branchName, this.destinationList, logMessages);
    const jiraIssue = await this.getJiraIssue(branchName, logMessages);

    if (trelloCardResults) {
      logMessages.push(`\nFound Trello card number (${trelloCardResults.card.idShort}) in branch: ${branchName}`);
    }

    let jiraIssueUrl: string | undefined;
    if (jiraIssue) {
      logMessages.push(`\nFound JIRA issue (${jiraIssue.key}) in branch: ${branchName}`);
      jiraIssueUrl = `${this.jira?.baseUrl ?? ''}/browse/${jiraIssue.key}`;
    }

    if (!trelloCardResults && !jiraIssue) {
      logMessages.push(`\nCould not find trello card or jira issue\n${JSON.stringify(this.payload)}`);
      throw new Error(logMessages.join(''));
    }

    let comment: string;
    const jiraComment: BlockContent[] = [];
    if (this.payload.sender) {
      comment = `Pull request merged by [${this.payload.sender.login}](${this.payload.sender.html_url})`;

      jiraComment.push({
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: `Pull request merged by `,
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
      comment = `Pull request merged!`;
      jiraComment.push({
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: `Pull request merged!`,
          },
        ],
      });
    }

    try {
      if (jiraIssue) {
        const updateJiraIssueResult = await this.updateJiraIssue({
          issueIdOrKey: jiraIssue.key,
          status: this.destinationStatus,
          comment: jiraComment,
        });

        logMessages.push(`\n${updateJiraIssueResult}`);
      }

      if (trelloCardResults) {
        const moveCardResult = await this.moveCard({
          ...trelloCardResults,
          comment,
        });

        logMessages.push(`\n${moveCardResult}`);
      }

      const now = new Date().toISOString();
      let description = '';
      if (jiraIssue) {
        description = `* [${jiraIssue.fields.summary}](${jiraIssueUrl})`;
      }

      if (trelloCardResults) {
        if (description) {
          description += '\n';
        }

        description += `* [${trelloCardResults.card.name}](${trelloCardResults.card.shortUrl})`;
      }

      const milestone = await this.createMilestone({
        due: now,
        description,
      });

      logMessages.push(`\nAssigning PR to milestone: ${milestone.number}`);

      await this.github.issues.update({
        owner: this.repo.owner,
        repo: this.repo.repo,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        issue_number: this.payload.pull_request.number,
        milestone: milestone.number,
      });

      if (this.createRelease) {
        console.log('Determining release name');
        const releaseNameMatches = /^([0-9]+)-([0-9]+)-([0-9]+)T([0-9]+):([0-9]+):([0-9]+)/.exec(now);
        if (releaseNameMatches) {
          let releaseName = '';
          for (let i = 1; i < releaseNameMatches.length; i += 1) {
            releaseName += releaseNameMatches[i];
          }

          logMessages.push(`\nCreating github release: ${releaseName}... `);

          let releaseMessage = '\n\n## Pull Request(s)';
          releaseMessage += `\n* [${this.payload.pull_request.title}](${this.payload.pull_request.html_url})`;

          if (jiraIssue) {
            releaseMessage += '\n\n## Jira Issue(s)';
            releaseMessage += `\n* [${jiraIssue.fields.summary}](${jiraIssueUrl})`;
          }

          if (trelloCardResults) {
            releaseMessage += '\n\n## Trello Card(s)';
            releaseMessage += `\n* [${trelloCardResults.card.name}](${trelloCardResults.card.shortUrl})`;
          }

          releaseMessage += '\n\n## Milestone(s)';
          releaseMessage += `\n* [${milestone.title}](${milestone.html_url})`;

          await this.github.repos.createRelease({
            owner: this.repo.owner,
            repo: this.repo.repo,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            tag_name: releaseName,
            name: releaseName,
            body: releaseMessage,
          });
          logMessages.push(`Done!`);
        } else {
          logMessages.push(`\nCould not figure out how to name the release :(`);
        }
      }

      if (this.jira && jiraIssue) {
        logMessages.push(`\nAdding milestone url (${milestone.html_url}) as remote link to jira issue: ${jiraIssue.key}... `);
        await this.jira.addRemoteLinkToIssue({
          issueIdOrKey: jiraIssue.key,
          name: `GitHub Milestone: ${milestone.title}`,
          url: milestone.html_url,
        });
      }

      if (trelloCardResults) {
        logMessages.push(`\nAdding milestone url (${milestone.html_url}) as attachment to trello card: ${trelloCardResults.card.id}... `);
        await this.trello.addAttachmentToCard({
          cardId: trelloCardResults.card.id,
          name: `GitHub Milestone: ${milestone.title}`,
          url: milestone.html_url,
        });
      }

      logMessages.push('\nDone!');
    } catch (ex) {
      if (ex instanceof Error && ex.stack) {
        logMessages.push(`\n${ex.stack}`);
      }

      console.error(ex);
    }

    return logMessages.join('');
  }

  private async createMilestone({ due, title = `Deploy ${due}`, description }: ICreateMilestoneParams): Promise<IssuesCreateMilestoneResponse> {
    const milestoneResponse = await this.github.issues.createMilestone({
      owner: this.repo.owner,
      repo: this.repo.repo,
      title,
      description,
      state: this.closeMilestone ? 'closed' : 'open',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      due_on: due,
    });

    const milestone = milestoneResponse.data;
    console.log(`Milestone created: ${milestone.id}`);
    return milestone;
  }
}
