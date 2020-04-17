import * as crypto from 'crypto';
import { Request, Response } from 'express';
import { postErrorMessage } from '../services/slackService';
import { PullRequestMerged, PullRequestReady, WorkflowBase, WorkingOnCard } from '../workflows';

export const index = async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    if (!payload) {
      throw new Error(`Unable to find payload in github event: ${JSON.stringify(req, null, 1)}`);
    }

    const secret = process.env.GITHUB_SECRET;
    if (secret) {
      const signature = req.header('X-Hub-Signature');
      if (!signature) {
        throw new Error('X-Hub-Signature was not specified');
      }

      const hmac = crypto.createHmac('sha1', secret);
      const hexDigest = hmac.update(payload).digest('hex');
      const digest = Buffer.from(`sha1=${hexDigest}`, 'utf8');
      const checksum = Buffer.from(signature, 'utf8');
      if (checksum.length !== digest.length || !crypto.timingSafeEqual(digest, checksum)) {
        throw new Error('Unable to verify github request based on secret and signature');
      }
    }

    const trelloBoardName = req.query.boardName as string | undefined;
    if (!trelloBoardName) {
      throw new Error('`boardName` query string is not defined.');
    }

    const prMergeDestinationList = req.query.pr_merge_dest as string | undefined;
    const prCloseDestinationList = req.query.pr_close_dest as string | undefined;
    const prOpenDestinationList = req.query.pr_open_dest as string | undefined;

    let workflow: WorkflowBase;

    let result: string;
    if (payload.zen) {
      result = 'Feeling very zen-like!';
    } else {
      if (payload.pull_request) {
        if (payload.action === 'closed') {
          if (payload.pull_request.merged) {
            // pull_request closed (merged)
            workflow = new PullRequestMerged({
              eventPayload: payload,
              trelloBoardName,
              destinationList: prMergeDestinationList || process.env.PR_MERGE_DEST_LIST || 'Deploy',
              closeMilestone: req.query.closeMilestone !== 'false',
            });
          } else {
            // pull_request closed (not merged)
            workflow = new WorkingOnCard({
              eventPayload: payload,
              trelloBoardName,
              destinationList: prCloseDestinationList || process.env.PR_CLOSE_DEST_LIST || 'Doing',
            });
          }
        } else {
          // pull_request opened or reopened
          workflow = new PullRequestReady({
            eventPayload: payload,
            trelloBoardName,
            destinationList: prOpenDestinationList || process.env.PR_OPEN_DEST_LIST || 'Review',
          });
        }
      } else {
        // Branch created
        workflow = new WorkingOnCard({
          eventPayload: payload,
          trelloBoardName,
          destinationList: prCloseDestinationList || process.env.PR_CLOSE_DEST_LIST || 'Doing',
        });
      }

      result = await workflow.execute();
    }

    return res.json({
      ok: true,
      event: req.header('X-GitHub-Event'),
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
