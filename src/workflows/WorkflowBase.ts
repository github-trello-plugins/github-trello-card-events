import type { Octokit } from '@octokit/rest';

import { getGitHubClient } from '../services/githubService.js';
import { JiraService } from '../services/jiraService.js';
import { TrelloService } from '../services/trelloService.js';
import type { IWebhookPayload } from '../types/github/index.js';
import type { Issue } from '../types/jira/index.js';
import type { IBoard, ICard, IList } from '../types/trello/index.js';

export interface IWorkflowBaseParams {
  boardsAndBranchNamePrefixes: Record<string, string>;
  jiraKeyPrefix?: string;
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

interface IUpdateJiraStatusParams {
  issueIdOrKey: string;
  status: string;
  comment?: string;
}

interface IRepo {
  owner: string;
  repo: string;
}

export interface IGetTrelloCardDetailsResult {
  card: ICard;
  list: IList;
  board: IBoard;
}

export abstract class WorkflowBase {
  protected readonly github: Octokit;

  protected readonly trello: TrelloService;

  protected readonly jira: JiraService | undefined;

  protected readonly payload: IWebhookPayload;

  protected readonly boardsAndBranchNamePrefixes: Record<string, string>;

  protected readonly jiraKeyPrefix?: string;

  public constructor({ boardsAndBranchNamePrefixes, jiraKeyPrefix, eventPayload }: IWorkflowBaseParams) {
    this.github = getGitHubClient();
    this.trello = new TrelloService();
    if (jiraKeyPrefix) {
      this.jira = new JiraService();
    }

    this.boardsAndBranchNamePrefixes = boardsAndBranchNamePrefixes;
    this.payload = eventPayload;
    this.jiraKeyPrefix = jiraKeyPrefix;
  }

  public get repo(): IRepo {
    return {
      owner: this.payload.repository.owner.login,
      repo: this.payload.repository.name,
    };
  }

  public abstract execute(): Promise<string>;

  protected async getJiraIssue(branchName: string, logMessages: string[]): Promise<Issue | undefined> {
    if (!this.payload.pull_request) {
      throw new Error(`There were no pull_request details with payload: ${JSON.stringify(this.payload)}`);
    }

    if (this.jira && this.jiraKeyPrefix) {
      // eslint-disable-next-line security/detect-non-literal-regexp
      const jiraKeyRegEx = new RegExp(`${this.jiraKeyPrefix}[- ](\\d+)`, 'i');

      // Try to find the JIRA issue key from the PR title first and otherwise fallback to branch name
      let jiraKey: string | undefined;
      const prNameMatches = jiraKeyRegEx.exec(this.payload.pull_request.title);
      if (prNameMatches?.length) {
        jiraKey = `${this.jiraKeyPrefix}-${prNameMatches[1]}`;
      }

      if (!jiraKey) {
        const branchNameMatches = jiraKeyRegEx.exec(branchName);
        if (branchNameMatches?.length) {
          jiraKey = `${this.jiraKeyPrefix}-${branchNameMatches[1]}`;
        }
      }

      if (jiraKey) {
        try {
          return await this.jira.getIssue(jiraKey);
        } catch (ex) {
          if (ex instanceof Error) {
            ex.message = `${logMessages.join('')}\n${ex.message}`;
          } else {
            (ex as Error).message = logMessages.join('');
          }

          throw ex;
        }
      }
    }

    return undefined;
  }

  protected async getTrelloCardDetails(branchName: string, listName: string, logMessages: string[]): Promise<IGetTrelloCardDetailsResult | undefined> {
    const [trelloBoardName, getBoardNameDetails] = this.getBoardNameFromBranchName(branchName);
    logMessages.push(`\n${getBoardNameDetails}`);

    if (trelloBoardName) {
      logMessages.push(`\nUsing board (${trelloBoardName}) based on branch prefix: ${branchName}`);
    } else {
      logMessages.push(`\nUnable to find board name based on card prefix in branch name: ${branchName}`);
      throw new Error(logMessages.join(''));
    }

    const trelloBranchPrefix = this.boardsAndBranchNamePrefixes[trelloBoardName] ?? '';
    // eslint-disable-next-line security/detect-non-literal-regexp
    const cardNumberRegEx = new RegExp(`${trelloBranchPrefix}(\\d+)`, 'i');
    const cardNumberMatches = cardNumberRegEx.exec(branchName);
    let cardNumber: string | undefined;
    if (cardNumberMatches?.length) {
      cardNumber = cardNumberMatches[1];
    }

    if (!cardNumber) {
      logMessages.push(`\nUnable to find card number in branch name: ${branchName}`);
      return undefined;
    }

    const board = await this.getBoard(trelloBoardName);
    const list = this.getList(board, listName);
    let card: ICard;

    try {
      card = await this.getCard({
        boardId: board.id,
        cardNumber,
      });
    } catch (ex) {
      if (ex instanceof Error) {
        ex.message = `${logMessages.join('')}\n${ex.message}`;
      } else {
        (ex as Error).message = logMessages.join('');
      }

      throw ex;
    }

    return {
      board,
      list,
      card,
    };
  }

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

  protected async updateJiraIssue({ issueIdOrKey, status, comment }: IUpdateJiraStatusParams): Promise<string> {
    if (!this.jira) {
      return 'No jira service';
    }

    let result = `Updating jira issue status to: ${status}`;

    await this.jira.updateIssueStatus({
      issueIdOrKey,
      status,
    });

    if (comment) {
      try {
        result += `\nAdding comment to jira issue: ${comment}`;
        await this.jira.addCommentToIssue({
          issueIdOrKey,
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

    result += `\nUpdated issue ${issueIdOrKey} status: ${status}`;
    return result;
  }
}
