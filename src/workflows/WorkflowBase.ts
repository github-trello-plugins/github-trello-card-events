import type { Octokit } from '@octokit/rest';

import { getGitHubClient } from '../services/githubService';
import { TrelloService } from '../services/trelloService';
import type { IWebhookPayload } from '../types/github';
import type { IBoard, ICard, IList } from '../types/trello';

export interface IWorkflowBaseParams {
  boardsAndBranchNamePrefixes: Record<string, string>;
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

  protected readonly boardsAndBranchNamePrefixes: Record<string, string>;

  public constructor({ boardsAndBranchNamePrefixes, eventPayload }: IWorkflowBaseParams) {
    this.github = getGitHubClient();
    this.trello = new TrelloService();
    this.boardsAndBranchNamePrefixes = boardsAndBranchNamePrefixes;
    this.payload = eventPayload;
  }

  public get repo(): IRepo {
    return {
      owner: this.payload.repository.owner.login,
      repo: this.payload.repository.name,
    };
  }

  public abstract execute(): Promise<string>;

  protected getBoardNameFromBranchName(branchName: string): [string | undefined, string] {
    let result = `Using board/branch mapping: ${JSON.stringify(this.boardsAndBranchNamePrefixes)}`;
    let boardName: string | undefined;
    const boardsAndBranchNamePrefixes = Object.entries(this.boardsAndBranchNamePrefixes);
    if (boardsAndBranchNamePrefixes.length === 1) {
      const [boardNames] = boardsAndBranchNamePrefixes;
      if (boardNames) {
        [boardName] = boardNames;
      }

      result += `\nUsing board: ${boardName ?? '--Unknown--'}`;
    } else {
      let defaultBoardName: string | undefined;
      for (const [nameOfBoard, branchNamePrefix] of boardsAndBranchNamePrefixes) {
        if (!branchNamePrefix || branchNamePrefix === 'default') {
          defaultBoardName = nameOfBoard;
        } else if (branchName.startsWith(branchNamePrefix.toLowerCase())) {
          boardName = nameOfBoard;
          result += `\nFound board (${boardName}) based on branch prefix: ${branchName}`;
          break;
        }
      }

      if (defaultBoardName && !boardName) {
        boardName = defaultBoardName;
        result += `\nUsing default board (${boardName}) based on branch prefix: ${branchName}`;
      }
    }

    return [boardName, result];
  }

  protected async getBoard(name: string): Promise<IBoard> {
    const allBoards = await this.trello.listBoards();

    const lowerBoardName = name.toLowerCase();
    const boards = allBoards.filter((board) => board.name.toLowerCase() === lowerBoardName);
    if (boards.length !== 1) {
      throw new Error(`Unable to find board: ${name}`);
    }

    const board = boards[0];
    if (!board) {
      throw new Error(`Unable to find board: ${name}`);
    }

    console.log(`Found board: ${board.id}`);

    return board;
  }

  protected getList(board: IBoard, listName: string): IList {
    const lists = board.lists.filter((list: IList) => list.name === listName && !list.closed);
    if (lists.length !== 1) {
      throw new Error(`Unable to find list: ${listName}`);
    }

    const list = lists[0];
    if (!list) {
      throw new Error(`Unable to find list: ${listName}`);
    }

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
        if (ex instanceof Error && ex.stack) {
          result += `\n${ex.stack}`;
        }

        // Log, but ignore since this is a bonus and not the primary action
        console.error(ex);
      }
    }

    result += `\nMoved card ${card.id} to list: ${list.name}`;
    return result;
  }
}
