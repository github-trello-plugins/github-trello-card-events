import type { GitHubWithTrelloApi } from '../types/GitHubWithTrelloApi';
import type { IBoard, ICard, IList } from '../types/trello';
import { assertValidTrelloResponse, getExtendedGitHubClient } from '../services/githubService';
import type { IWebhookPayload } from '../types/github';

export interface IWorkflowBaseParams {
  trelloBoardName: string;
  eventPayload: IWebhookPayload;
}

interface IGetCardParams {
  boardId: string;
  cardNumber: string;
}

interface IMoveCardParams {
  card: ICard;
  list: IList;
  comment?: string;
}

interface IRepo {
  owner: string;
  repo: string;
}

export abstract class WorkflowBase {
  protected readonly github: GitHubWithTrelloApi;

  protected readonly payload: IWebhookPayload;

  protected readonly trelloBoardName: string;

  public constructor({ trelloBoardName, eventPayload }: IWorkflowBaseParams) {
    this.github = getExtendedGitHubClient();
    this.trelloBoardName = trelloBoardName;
    this.payload = eventPayload;
  }

  public get repo(): IRepo {
    if (this.payload.repository) {
      return {
        owner: this.payload.repository.owner.login,
        repo: this.payload.repository.name,
      };
    }

    throw new Error('Unable to find payload.repository');
  }

  public abstract execute(): Promise<string>;

  protected async getBoard(name: string): Promise<IBoard> {
    const listBoardsResponse = await this.github.trello.listBoards();

    assertValidTrelloResponse(listBoardsResponse, 'Unable to fetch boards');

    const boards = listBoardsResponse.data.filter((board) => board.name === name);
    if (boards.length !== 1) {
      throw new Error(`Unable to find board: ${name}`);
    }

    const board = boards[0];
    console.log(`Found board: ${board.id}`);

    return board;
  }

  protected getList(board: IBoard, listName: string): IList {
    const lists = board.lists.filter((list: IList) => list.name === listName && !list.closed);
    if (lists.length !== 1) {
      throw new Error(`Unable to find list: ${listName}`);
    }

    const list = lists[0];
    console.log(`Found list: ${list.id} - ${list.name}`);

    return list;
  }

  protected async getCard({ boardId, cardNumber }: IGetCardParams): Promise<ICard> {
    const cardResponse = await this.github.trello.getCard({
      boardId,
      cardNumber,
    });

    assertValidTrelloResponse(cardResponse, 'Unable to get card details');

    const card = cardResponse.data;

    console.log(`Found card: ${card.id}`);
    return card;
  }

  protected async moveCard({ card, list, comment }: IMoveCardParams): Promise<string> {
    if (card.idList === list.id) {
      return 'Card already in list';
    }

    let result = `Moving card to list: ${list.name}`;

    await this.github.trello.moveCard({
      cardId: card.id,
      idList: list.id,
    });

    if (comment) {
      try {
        result += `\nAdding comment to card: ${comment}`;
        await this.github.trello.addCommentToCard({
          cardId: card.id,
          text: comment,
        });
      } catch (ex) {
        // Log, but ignore since this is a bonus and not the primary action
        result += `\n${ex.stack}`;
        console.error(ex);
      }
    }

    result += `\nMoved card ${card.id} to list: ${list.name}`;
    return result;
  }
}
