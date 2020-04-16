import { Request, Response } from 'express';
import { postErrorMessage } from '../services/slackService';
import { PullRequestMerged, PullRequestReady, WorkflowBase, WorkingOnCard } from '../workflows';

export const index = async (req: Request, res: Response) => {
  try {
    const { payload } = req.body;
    if (!payload) {
      throw new Error(`Unable to find payload in github event: ${JSON.stringify(req.body, null, 1)}`);
    }

    const trelloBoardName = req.query.boardName as string | undefined;
    if (!trelloBoardName) {
      throw new Error('`boardName` query string is not defined.');
    }

    const destinationList = req.query.dest as string | undefined;

    let workflow: WorkflowBase;
    if (payload.pull_request) {
      if (payload.action === 'closed') {
        if (payload.pull_request.merged) {
          // pull_request closed (merged)
          workflow = new PullRequestMerged({
            eventPayload: payload,
            trelloBoardName,
            destinationList: destinationList || process.env.PR_MERGE_DEST_LIST || 'Deploy',
            closeMilestone: req.query.closeMilestone !== 'false',
          });
        } else {
          // pull_request closed (not merged)
          workflow = new WorkingOnCard({
            eventPayload: payload,
            trelloBoardName,
            destinationList: destinationList || process.env.PR_CLOSE_DEST_LIST || 'Doing',
          });
        }
      } else {
        // pull_request opened or reopened
        workflow = new PullRequestReady({
          eventPayload: payload,
          trelloBoardName,
          destinationList: destinationList || process.env.PR_OPEN_DEST_LIST || 'Review',
        });
      }
    } else {
      // Branch created
      workflow = new WorkingOnCard({
        eventPayload: payload,
        trelloBoardName,
        destinationList: destinationList || process.env.PR_CLOSE_DEST_LIST || 'Doing',
      });
    }

    const result = await workflow.execute();
    return res.json({
      ok: true,
      result,
    });
  } catch (ex) {
    if (process.env.SLACK_ERROR_WEBHOOK) {
      await postErrorMessage({
        error: ex,
      });
    }

    return res.status(500).json({
      ok: false,
      err: {
        message: ex.message,
        stack: ex.stack,
      },
    });
  }
};
