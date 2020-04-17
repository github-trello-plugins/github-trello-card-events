import type { Octokit } from '@octokit/rest';
import { getGitHubClient } from '../services/githubService';
import { TrelloService } from '../services/trelloService';
import type { IBoard, ICard, IList } from '../types/trello';
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
  protected readonly github: Octokit;

  protected readonly trello: TrelloService;

  protected readonly payload: IWebhookPayload;

  protected readonly trelloBoardName: string;

  public constructor({ trelloBoardName, eventPayload }: IWorkflowBaseParams) {
    this.github = getGitHubClient();
    this.trello = new TrelloService();
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
    const allBoards = await this.trello.listBoards();

    const boards = allBoards.filter((board) => board.name === name);
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
    const card = await this.trello.getCard({
      boardId,
      cardNumber,
    });

    console.log(`Found card: ${card.id}`);
    return card;
  }

  protected async moveCard({ card, list, comment }: IMoveCardParams): Promise<string> {
    if (card.idList === list.id) {
      return 'Card already in list';
    }

    let result = `Moving card to list: ${list.name}`;

    await this.trello.moveCard({
      cardId: card.id,
      listId: list.id,
    });

    if (comment) {
      try {
        result += `\nAdding comment to card: ${comment}`;
        await this.trello.addCommentToCard({
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
