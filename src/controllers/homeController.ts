import { Request, Response } from 'express';
import type { IBoard } from '../types/trello';
import { TrelloService } from '../services/trelloService';

export function index(_: Request, res: Response): Response {
  return res.send(`:)<br />${process.env.GIT_REV || ''}`);
}

export async function healthCheck(_: Request, res: Response): Promise<Response> {
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
      err: {
        code: ex.code,
        message: ex.message,
        stack: ex.stack,
      },
    });
  }
}
