import type { Endpoints } from '@octokit/types';

import type { ICard } from '../types/trello';

import type { IWorkflowBaseParams } from './WorkflowBase';
import { WorkflowBase } from './WorkflowBase';

type IssuesCreateMilestoneResponse = Endpoints['POST /repos/{owner}/{repo}/milestones']['response']['data'];

interface IPullRequestMergedParams extends IWorkflowBaseParams {
  destinationList: string;
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

  public createRelease: boolean;

  public closeMilestone: boolean;

  public constructor(params: IPullRequestMergedParams) {
    super(params);

    this.destinationList = params.destinationList;
    this.createRelease = params.createRelease;
    this.closeMilestone = params.closeMilestone;
  }

  public async execute(): Promise<string> {
    if (!this.payload.pull_request) {
      throw new Error(`There were no pull_request details with payload: ${JSON.stringify(this.payload)}`);
    }

    const branchName = this.payload.pull_request.head.ref.trim().replace(/\W+/g, '-').toLowerCase();
    const cardNumberMatches = /\d+/g.exec(branchName);
    let cardNumber: string | undefined;
    if (cardNumberMatches?.length) {
      [cardNumber] = cardNumberMatches;
    }

    if (!cardNumber) {
      console.log(JSON.stringify(this.payload));
      return `PullRequestMerged: Could not find card number in branch name\n${JSON.stringify(this.payload)}`;
    }

    let result = `Starting PullRequestMerged workflow\n-----------------`;
    result += `\nFound card number (${cardNumber}) in branch: ${branchName}`;

    const [trelloBoardName, getBoardNameDetails] = this.getBoardNameFromBranchName(branchName);
    result += `\n${getBoardNameDetails}`;

    if (trelloBoardName) {
      result += `\nUsing board (${trelloBoardName}) based on branch prefix: ${branchName}`;
    } else {
      result += `\nUnable to find board name based on card prefix in branch name: ${branchName}`;
      throw new Error(result);
    }

    const board = await this.getBoard(trelloBoardName);
    const list = this.getList(board, this.destinationList);

    let card: ICard;

    try {
      card = await this.getCard({
        boardId: board.id,
        cardNumber,
      });
    } catch (ex) {
      if (ex instanceof Error) {
        ex.message = `${result}\n${ex.message}`;
      } else {
        (ex as Error).message = result;
      }

      throw ex;
    }

    let comment: string;
    if (this.payload.sender) {
      comment = `Pull request merged by [${this.payload.sender.login}](${this.payload.sender.html_url})`;
    } else {
      comment = `Pull request merged!`;
    }

    const moveCardResult = await this.moveCard({
      card,
      list,
      comment,
    });

    result += `\n${moveCardResult}`;

    try {
      const now = new Date().toISOString();
      const milestone = await this.createMilestone({
        due: now,
        description: `* [${card.name}](${card.shortUrl})`,
      });

      result += `\nAssigning PR to milestone: ${milestone.number}`;

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

          result += `\nCreating github release: ${releaseName}... `;

          let releaseMessage = '## Trello Card(s)';
          releaseMessage += `\n* [${card.name}](${card.shortUrl})`;

          releaseMessage += '\n\n## Pull Request(s)';
          releaseMessage += `\n* [${this.payload.pull_request.title}](${this.payload.pull_request.html_url})`;

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
          result += `Done!`;
        } else {
          result += `\nCould not figure out how to name the release :(`;
        }
      }

      result += `\nAdding milestone url (${milestone.html_url}) as attachment to trello card: ${card.id}... `;
      await this.trello.addAttachmentToCard({
        cardId: card.id,
        name: 'github-milestone',
        url: milestone.html_url,
      });
      result += 'Done!';
    } catch (ex) {
      if (ex instanceof Error && ex.stack) {
        result += `\n${ex.stack}`;
      }

      console.error(ex);
    }

    return result;
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
