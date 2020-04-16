import { Octokit } from '@octokit/rest';
import { GitHubWithTrelloApi } from '../types/GitHubWithTrelloApi';

export interface IDataResponse<T> {
  data: T;
}

export interface IErrorResponse {
  error: string;
  message: string;
}

export function getExtendedGitHubClient(): GitHubWithTrelloApi {
  const token = process.env.GITHUB_TOKEN;
  const userAgent = process.env.GITHUB_USER_AGENT;

  if (!token) {
    throw new Error('GITHUB_TOKEN was not defined');
  }

  const github = new Octokit({
    auth: `token ${token}`,
    userAgent,
    log: console,
  }) as GitHubWithTrelloApi;

  const trelloKeyTokenParams = {
    key: {
      required: true,
      type: 'string',
      default: process.env.TRELLO_KEY,
    },
    token: {
      required: true,
      type: 'string',
      default: process.env.TRELLO_TOKEN,
    },
  };

  Object.assign(github.trello, {
    listBoards: github.request.defaults({
      method: 'GET',
      url: 'https://api.trello.com/1/members/me/boards?key=:key&token=:token&lists=all&fields=name',
      params: {
        ...trelloKeyTokenParams,
      },
    }),
    getCard: github.request.defaults({
      method: 'GET',
      url: 'https://api.trello.com/1/boards/:boardId/cards/:cardNumber?key=:key&token=:token',
      params: {
        ...trelloKeyTokenParams,
        boardId: {
          required: true,
          type: 'string',
        },
        cardNumber: {
          required: true,
          type: 'string',
        },
      },
    }),
    moveCard: github.request.defaults({
      method: 'PUT',
      url: 'https://api.trello.com/1/cards/:cardId',
      params: {
        ...trelloKeyTokenParams,
        cardId: {
          required: true,
          type: 'string',
        },
        idList: {
          required: true,
          type: 'string',
        },
      },
    }),
    addAttachmentToCard: github.request.defaults({
      method: 'POST',
      url: 'https://api.trello.com/1/cards/:cardId/attachments?key=:key&token=:token&name=:name&url=:url',
      params: {
        ...trelloKeyTokenParams,
        cardId: {
          required: true,
          type: 'string',
        },
        name: {
          required: true,
          type: 'string',
        },
        url: {
          required: true,
          type: 'string',
        },
      },
    }),
    addCommentToCard: github.request.defaults({
      method: 'POST',
      url: 'https://api.trello.com/1/cards/:cardId/actions/comments',
      params: {
        ...trelloKeyTokenParams,
        cardId: {
          required: true,
          type: 'string',
        },
        text: {
          required: true,
          type: 'string',
        },
      },
    }),
  });

  return github;
}

export function assertValidTrelloResponse<T>(response: IDataResponse<T> | IErrorResponse, errorMessage: string): asserts response is IDataResponse<T> {
  if (!(response as IDataResponse<T>).data) {
    const errorResponse = response as IErrorResponse;
    throw new Error(`${errorMessage}: ${errorResponse.error}\n${errorResponse.message}`);
  }
}
