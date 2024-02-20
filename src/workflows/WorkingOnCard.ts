import type { IWorkflowBaseParams } from './WorkflowBase.js';
import { WorkflowBase } from './WorkflowBase.js';

interface IWorkingOnCardParams extends IWorkflowBaseParams {
  destinationList: string;
  destinationStatus: string;
}

export class WorkingOnCard extends WorkflowBase {
  public destinationList: string;

  public destinationStatus: string;

  public constructor(params: IWorkingOnCardParams) {
    super(params);

    this.destinationList = params.destinationList;
    this.destinationStatus = params.destinationStatus;
  }

  public async execute(): Promise<string> {
    if (this.payload.ref_type === 'tag') {
      return 'Skipping tag event';
    }

    let comment: string | undefined;
    let branchName: string;
    if (this.payload.pull_request) {
      branchName = this.payload.pull_request.head.ref.trim().replace(/\W+/g, '-').toLowerCase();
      if (this.payload.sender) {
        comment = `Pull request closed by [${this.payload.sender.login}](${this.payload.sender.html_url})`;
      } else {
        comment = `Pull request closed!`;
      }
    } else {
      branchName = this.payload.ref.trim().replace(/\W+/g, '-').toLowerCase();
    }

    const logMessages = [`Starting WorkingOnCard workflow\n-----------------`];

    const trelloCardResults = await this.getTrelloCardDetails(branchName, this.destinationList, logMessages);
    const jiraIssue = await this.getJiraIssue(branchName, logMessages);

    if (trelloCardResults) {
      logMessages.push(`\nFound Trello card number (${trelloCardResults.card.idShort}) in branch: ${branchName}`);
    }

    if (jiraIssue) {
      logMessages.push(`\nFound JIRA issue (${jiraIssue.key}) in branch: ${branchName}`);
    }

    if (!trelloCardResults && !jiraIssue) {
      logMessages.push(`\nCould not find trello card or jira issue\n${JSON.stringify(this.payload)}`);
      throw new Error(logMessages.join(''));
    }

    if (this.jira && jiraIssue) {
      try {
        const updateJiraIssueResult = await this.updateJiraIssue({
          issueIdOrKey: jiraIssue.key,
          status: this.destinationStatus,
          comment,
        });

        logMessages.push(`\n${updateJiraIssueResult}`);
      } catch (ex) {
        if (ex instanceof Error) {
          ex.message = `${logMessages.join('')}\n${ex.message}`;
        } else {
          (ex as Error).message = logMessages.join('');
        }

        throw ex;
      }
    }

    if (trelloCardResults) {
      try {
        const moveCardResult = await this.moveCard({
          ...trelloCardResults,
          comment,
        });

        logMessages.push(`\n${moveCardResult}`);
      } catch (ex) {
        if (ex instanceof Error) {
          ex.message = `${logMessages.join('')}\n${ex.message}`;
        } else {
          (ex as Error).message = logMessages.join('');
        }

        throw ex;
      }
    }

    return logMessages.join('');
  }
}
