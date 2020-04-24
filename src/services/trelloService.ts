import { URL } from 'url';
import * as request from 'request-promise';
import { IBoard, ICard } from '../types/trello';

export class TrelloService {
  protected readonly key: string;

  protected readonly token: string;

  public constructor() {
    this.key = process.env.TRELLO_KEY || '';
    if (!this.key) {
      throw new Error('TRELLO_KEY not defined.');
    }

    this.token = process.env.TRELLO_TOKEN || '';
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

    const boards = await request.get(getBoardUrl.href, {
      json: true,
      timeout: 10000,
    });

    if (boards.error) {
      throw new Error(`Error fetching trello boards: ${boards.error}\n${boards.message}`);
    }

    return boards;
  }

  public async getCard({ boardId, cardNumber }: { boardId: string; cardNumber: string }): Promise<ICard> {
    const getBoardUrl = new URL(`https://api.trello.com/1/boards/${boardId}/cards/${cardNumber}`);
    getBoardUrl.searchParams.set('key', this.key);
    getBoardUrl.searchParams.set('token', this.token);

    const card = await request.get(getBoardUrl.href, {
      json: true,
      timeout: 10000,
    });

    if (card.error) {
      throw new Error(`Error fetching trello card ${cardNumber}: ${card.error}\n${card.message}`);
    }

    return card;
  }

  public async moveCard({ cardId, listId }: { cardId: string; listId: string }): Promise<void> {
    const moveCardUrl = new URL(`https://api.trello.com/1/cards/${cardId}`);
    moveCardUrl.searchParams.set('key', this.key);
    moveCardUrl.searchParams.set('token', this.token);
    moveCardUrl.searchParams.set('idList', listId);

    await request.put(moveCardUrl.href);
  }

  public async addAttachmentToCard({ cardId, name, url }: { cardId: string; name: string; url: string }): Promise<void> {
    await request.post(`https://api.trello.com/1/cards/${cardId}/attachments`, {
      json: {
        key: this.key,
        token: this.token,
        name,
        url,
      },
    });
  }

  public async addCommentToCard({ cardId, text }: { cardId: string; text: string }): Promise<void> {
    await request.post(`https://api.trello.com/1/cards/${cardId}/actions/comments`, {
      formData: {
        key: this.key,
        token: this.token,
        text,
      },
    });
  }
}
