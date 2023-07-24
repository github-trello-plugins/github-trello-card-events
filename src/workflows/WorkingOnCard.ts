import type { IWorkflowBaseParams } from './WorkflowBase';
import { WorkflowBase } from './WorkflowBase';

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

    const cardNumberMatches = /\d+/g.exec(branchName);
    let cardNumber;
    if (cardNumberMatches?.length) {
      [cardNumber] = cardNumberMatches;
    }

    if (!cardNumber) {
      console.log(JSON.stringify(this.payload));
      return `WorkingOnCard: Could not find card number in branch name\n${JSON.stringify(this.payload)}`;
    }

    let result = `Starting WorkingOnCard workflow\n-----------------`;
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
      if (ex instanceof Error) {
        ex.message = `${result}\n${ex.message}`;
      } else {
        (ex as Error).message = result;
      }

      throw ex;
    }

    return result;
  }
}
