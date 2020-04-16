import { Request, Response } from 'express';
import { postMessage } from '../services/slackService';

// NOTE: This is a legacy url and will be removed
export const index = async (_: Request, res: Response) => {
  await postMessage({
    isText: true,
    icon: ':man-shrugging:',
    message: 'Updated datica with cards since the last datica deploy.',
  });

  return res.json({
    ok: true,
    message: `Updated datica`,
  });
};
