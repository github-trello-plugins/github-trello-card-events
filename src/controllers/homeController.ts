import type { AxiosError } from 'axios';
import type { Request, Response } from 'express';
import _ from 'lodash';

import { TrelloService } from '../services/trelloService.js';
import type { IBoard } from '../types/trello/index.js';

declare const process: {
  env: {
    GIT_REV: string | undefined;
    FLY_REGION: string | undefined;
    FLY_ALLOC_ID: string | undefined;
  };
};

export function index(_req: Request, res: Response): Response {
  const flyInfo = _.trim(`${process.env.FLY_REGION ?? ''} - ${process.env.FLY_ALLOC_ID ?? ''}`, '- ');
  return res.send(`:)<br />${process.env.GIT_REV ?? ''}<br />${flyInfo}`);
}

export async function healthCheck(_req: Request, res: Response): Promise<Response> {
  try {
    const trello = new TrelloService();
    const boards = await trello.listBoards();

    return res.json({
      ok: true,
      boards: boards.map((board: IBoard) => board.name),
    });
  } catch (ex) {
    return res.status(500).json({
      ok: false,
      error: (ex as Error).message,
      stack: (ex as Error).stack,
      response: (ex as AxiosError).response,
      err: ex,
    });
  }
}
