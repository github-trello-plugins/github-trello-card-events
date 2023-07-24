import { URL } from 'url';

import axios from 'axios';

import type { IBoard, ICard, IError } from '../types/trello';

declare const process: {
  env: {
    TRELLO_KEY: string | undefined;
    TRELLO_TOKEN: string | undefined;
  };
};

export class TrelloService {
  protected readonly key: string;

  protected readonly token: string;

  public constructor() {
    this.key = process.env.TRELLO_KEY ?? '';
    if (!this.key) {
      throw new Error('TRELLO_KEY not defined.');
    }

    this.token = process.env.TRELLO_TOKEN ?? '';
    if (!this.token) {
      throw new Error('TRELLO_TOKEN not defined.');
    }
  }

  public async listBoards(): Promise<IBoard[]> {
    const getBoardUrl = new URL('https://api.trello.com/1/members/me/boards');
    getBoardUrl.searchParams.set('lists', 'open');
    getBoardUrl.searchParams.set('fields', 'name');
    getBoardUrl.searchParams.set('key', this.key);
    getBoardUrl.searchParams.set('token', this.token);

    const boardsResponse = await axios.get<IBoard[] | IError>(getBoardUrl.href, {
      timeout: 10000,
    });

    const errorResponse = boardsResponse.data as IError;
    if (errorResponse.error) {
      throw new Error(`Error fetching trello board: ${errorResponse.error}\n${errorResponse.message}`);
    }

    return boardsResponse.data as IBoard[];
  }

  public async getCard({ boardId, cardNumber }: { boardId: string; cardNumber: string }): Promise<ICard> {
    const getBoardUrl = new URL(`https://api.trello.com/1/boards/${boardId}/cards/${cardNumber}`);
    getBoardUrl.searchParams.set('key', this.key);
    getBoardUrl.searchParams.set('token', this.token);

    const cardResponse = await axios.get<ICard | IError>(getBoardUrl.href, {
      timeout: 10000,
    });

    const errorResponse = cardResponse.data as IError;
    if (errorResponse.error) {
      throw new Error(`Error fetching trello card: ${errorResponse.error}\n${errorResponse.message}`);
    }

    return cardResponse.data as ICard;
  }

  public async moveCard({ cardId, listId }: { cardId: string; listId: string }): Promise<void> {
    const moveCardUrl = new URL(`https://api.trello.com/1/cards/${cardId}`);
    moveCardUrl.searchParams.set('key', this.key);
    moveCardUrl.searchParams.set('token', this.token);
    moveCardUrl.searchParams.set('idList', listId);

    await axios.put(moveCardUrl.href);
  }

  public async addAttachmentToCard({ cardId, name, url }: { cardId: string; name: string; url: string }): Promise<void> {
    await axios.post(`https://api.trello.com/1/cards/${cardId}/attachments`, {
      key: this.key,
      token: this.token,
      name,
      url,
    });
  }

  public async addCommentToCard({ cardId, text }: { cardId: string; text: string }): Promise<void> {
    await axios.post(`https://api.trello.com/1/cards/${cardId}/actions/comments`, {
      key: this.key,
      token: this.token,
      text,
    });
  }
}
