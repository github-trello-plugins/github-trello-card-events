import { IWorkflowBaseParams, WorkflowBase } from './WorkflowBase';
import type { IIssuesCreateMilestoneResponse } from '../types/github';

interface IPullRequestMergedParams extends IWorkflowBaseParams {
  destinationList: string;
  closeMilestone: boolean;
}

interface ICreateMilestoneParams {
  due: string;
  title?: string;
}

export class PullRequestMerged extends WorkflowBase {
  public destinationList: string;

  public closeMilestone: boolean;

  public constructor(params: IPullRequestMergedParams) {
    super(params);

    this.destinationList = params.destinationList;
    this.closeMilestone = params.closeMilestone;
  }

  public async execute(): Promise<string> {
    if (!this.payload.pull_request) {
      throw new Error(`There were no pull_request details with payload: ${JSON.stringify(this.payload)}`);
    }

    const branchName = this.payload.pull_request.head.ref.trim().replace(/\W+/g, '-').toLowerCase();
    const cardNumberMatches = /\d+/g.exec(branchName);
    let cardNumber: string | undefined;
    if (cardNumberMatches && cardNumberMatches.length) {
      [cardNumber] = cardNumberMatches;
    }

    if (!cardNumber) {
      console.log(JSON.stringify(this.payload));
      return `PullRequestMerged: Could not find card number in branch name\n${JSON.stringify(this.payload)}`;
    }

    let result = `Starting PullRequestMerged workflow\n-----------------`;
    result += `\nFound card number (${cardNumber}) in branch: ${branchName}`;

    const trelloBoardName = this.getBoardNameFromBranchName(branchName);

    if (trelloBoardName) {
      result += `\nUsing board (${trelloBoardName}) based on branch prefix: ${branchName}`;
    } else {
      result += `\nUnable to find board name based on card prefix in branch name: ${branchName}`;
      return result;
    }

    const board = await this.getBoard(trelloBoardName);
    const list = this.getList(board, this.destinationList);

    const card = await this.getCard({
      boardId: board.id,
      cardNumber,
    });

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
      });

      result += `\nAssigning PR to milestone: ${milestone.number}`;

      await this.github.issues.update({
        owner: this.repo.owner,
        repo: this.repo.repo,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        issue_number: this.payload.pull_request.number,
        milestone: milestone.number,
      });

      console.log('Determining release name');
      const releaseNameMatches = now.match(/^([0-9]+)-([0-9]+)-([0-9]+)T([0-9]+):([0-9]+):([0-9]+)/);
      if (releaseNameMatches) {
        let releaseName = '';
        for (let i = 1; i < releaseNameMatches.length; i += 1) {
          releaseName += releaseNameMatches[i];
        }

        result += `\nCreating github release: ${releaseName}... `;
        await this.github.repos.createRelease({
          owner: this.repo.owner,
          repo: this.repo.repo,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          tag_name: releaseName,
          name: releaseName,
          body: `* [${card.name}](${card.shortUrl})`,
        });
        result += `Done!`;
      } else {
        result += `\nCould not figure out how to name the release :(`;
      }

      result += `\nAdding milestone url (${milestone.html_url}) as attachment to trello card: ${card.id}... `;
      await this.trello.addAttachmentToCard({
        cardId: card.id,
        name: 'github-milestone',
        url: milestone.html_url,
      });
      result += 'Done!';
    } catch (ex) {
      result += `\n${ex.stack}`;
      console.error(ex);
    }

    return result;
  }

  private async createMilestone({ due, title = `Deploy ${due}` }: ICreateMilestoneParams): Promise<IIssuesCreateMilestoneResponse> {
    const milestoneResponse = await this.github.issues.createMilestone({
      owner: this.repo.owner,
      repo: this.repo.repo,
      title,
      state: this.closeMilestone ? 'closed' : 'open',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      due_on: due,
    });

    const milestone = milestoneResponse.data;
    if (!milestone) {
      throw new Error(`Unable to get newly created milestone: ${JSON.stringify(milestoneResponse)}`);
    }

    console.log(`Milestone created: ${milestone.id}`);
    return milestone;
  }
}
