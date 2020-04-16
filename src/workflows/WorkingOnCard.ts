import { IWorkflowBaseParams, WorkflowBase } from './WorkflowBase';

interface IWorkingOnCardParams extends IWorkflowBaseParams {
  destinationList: string;
}

export class WorkingOnCard extends WorkflowBase {
  public destinationList: string;

  public constructor(params: IWorkingOnCardParams) {
    super(params);

    this.destinationList = params.destinationList;
  }

  public async execute(): Promise<string> {
    if (this.payload.ref_type === 'tag') {
      return 'Skipping tag event';
    }

    const board = await this.getBoard(this.trelloBoardName);
    const list = this.getList(board, this.destinationList);

    let comment: string | undefined;

    // NOTE: https://developer.github.com/v3/git/refs/#create-a-reference
    let branchName = this.payload.ref.trim().replace(/\W+/g, '-').toLowerCase();
    if (this.payload.pull_request) {
      branchName = this.payload.pull_request.head.ref.trim().replace(/\W+/g, '-').toLowerCase();
      if (this.payload.sender) {
        comment = `Pull request closed by [${this.payload.sender.login}](${this.payload.sender.html_url})`;
      } else {
        comment = `Pull request closed!`;
      }
    }

    const cardNumberMatches = /\d+/g.exec(branchName);
    let cardNumber;
    if (cardNumberMatches && cardNumberMatches.length) {
      [cardNumber] = cardNumberMatches;
    }

    if (!cardNumber) {
      console.log(JSON.stringify(this.payload));
      return `WorkingOnCard: Could not find card number in branch name\n${JSON.stringify(this.payload)}`;
    }

    let result = `Starting WorkingOnCard workflow\n-----------------`;
    result += `\nFound card number (${cardNumber}) in branch: ${branchName}`;

    try {
      const card = await this.getCard({
        boardId: board.id,
        cardNumber,
      });

      const moveCardResult = await this.moveCard({
        card,
        list,
        comment,
      });

      result += `\n${moveCardResult}`;
    } catch (ex) {
      result += `\n${ex.stack}`;
      throw ex;
    }

    return result;
  }
}
