import { Request, Response } from 'express';
import { getExtendedGitHubClient, assertValidTrelloResponse } from '../services/githubService';
import type { IBoard } from '../types/trello';

export const index = (_: Request, res: Response) => {
  return res.send(':)');
};

export const healthCheck = async (_: Request, res: Response) => {
  const github = getExtendedGitHubClient();
  const listBoardsResponse = await github.trello.listBoards();
  assertValidTrelloResponse(listBoardsResponse, 'Unable to fetch boards');

  return res.json({
    ok: true,
    boards: listBoardsResponse.data.map((board: IBoard) => board.name),
  });
};
