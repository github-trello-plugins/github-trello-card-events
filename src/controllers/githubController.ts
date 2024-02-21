import * as crypto from 'crypto';

import type { AxiosError } from 'axios';
import type { Request, Response } from 'express';

import { postErrorMessage } from '../services/slackService.js';
import type { IWebhookPayload } from '../types/github/index.js';
import type { IRequestWithRawBody } from '../types/IRequestWithRawBody.js';
import { PullRequestMerged, PullRequestReady, WorkingOnCard } from '../workflows/index.js';
import type { WorkflowBase } from '../workflows/WorkflowBase.js';

declare const process: {
  env: {
    GITHUB_SECRET: string | undefined;
    PR_MERGE_DEST_LIST: string | undefined;
    PR_CLOSE_DEST_LIST: string | undefined;
    PR_OPEN_DEST_LIST: string | undefined;
    PR_MERGE_DEST_STATUS: string | undefined;
    PR_CLOSE_DEST_STATUS: string | undefined;
    PR_OPEN_DEST_STATUS: string | undefined;
    SLACK_ERROR_WEBHOOK: string | undefined;
  };
};

type IndexRequestBody = IWebhookPayload & { zen?: string };
interface IndexRequestQuery {
  boards?: Record<string, string>;
  boardName?: string;
  trello_branch_prefix?: string;
  pr_merge_dest?: string;
  pr_close_dest?: string;
  pr_open_dest?: string;
  jira_key_prefix?: string;
  pr_merge_status?: string;
  pr_close_status?: string;
  pr_open_status?: string;
  closeMilestone?: string;
  createRelease?: string;
}

export async function index(req: Request<unknown, unknown, IndexRequestBody, IndexRequestQuery>, res: Response): Promise<Response> {
  try {
    const payload = req.body;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const hexDigest = hmac.update((req as IRequestWithRawBody).rawBody || Buffer.from(JSON.stringify(req.body))).digest('hex');
      const digest = Buffer.from(`sha1=${hexDigest}`, 'utf8');
      const checksum = Buffer.from(signature, 'utf8');
      if (checksum.length !== digest.length || !crypto.timingSafeEqual(digest, checksum)) {
        throw new Error('Unable to verify github request based on secret and signature');
      }
    }

    let boardsAndBranchNamePrefixes = req.query.boards;
    const trelloBoardName = req.query.boardName;
    if (trelloBoardName) {
      boardsAndBranchNamePrefixes = {
        [trelloBoardName]: req.query.trello_branch_prefix ?? '',
      };
    } else if (!boardsAndBranchNamePrefixes) {
      throw new Error('`boardName` query string is not defined.');
    }

    const prMergeDestinationList = req.query.pr_merge_dest;
    const prCloseDestinationList = req.query.pr_close_dest;
    const prOpenDestinationList = req.query.pr_open_dest;
    const jiraKeyPrefix = req.query.jira_key_prefix;
    const prMergeDestinationStatus = req.query.pr_merge_status;
    const prCloseDestinationStatus = req.query.pr_close_status;
    const prOpenDestinationStatus = req.query.pr_open_status;

    let workflow: WorkflowBase | undefined;

    let result = `Skipping ${payload.action ?? 'unknown'} payload action.`;
    if (payload.zen) {
      result = 'Feeling very zen-like!';
    } else {
      if (payload.pull_request) {
        if (payload.action === 'closed') {
          if (payload.pull_request.merged) {
            // pull_request closed (merged)
            workflow = new PullRequestMerged({
              eventPayload: payload,
              boardsAndBranchNamePrefixes,
              destinationList: prMergeDestinationList ?? process.env.PR_MERGE_DEST_LIST ?? 'Done',
              jiraKeyPrefix,
              destinationStatus: prMergeDestinationStatus ?? process.env.PR_MERGE_DEST_STATUS ?? 'Done',
              closeMilestone: req.query.closeMilestone !== 'false',
              createRelease: req.query.createRelease !== 'false',
            });
          } else {
            // pull_request closed (not merged)
            workflow = new WorkingOnCard({
              eventPayload: payload,
              boardsAndBranchNamePrefixes,
              destinationList: prCloseDestinationList ?? process.env.PR_CLOSE_DEST_LIST ?? 'Doing',
              jiraKeyPrefix,
              destinationStatus: prCloseDestinationStatus ?? process.env.PR_CLOSE_DEST_STATUS ?? 'In Progress',
            });
          }
        } else if (['opened', 'reopened'].includes(payload.action ?? '')) {
          // pull_request opened or reopened
          workflow = new PullRequestReady({
            eventPayload: payload,
            boardsAndBranchNamePrefixes,
            destinationList: prOpenDestinationList ?? process.env.PR_OPEN_DEST_LIST ?? 'Review',
            jiraKeyPrefix,
            destinationStatus: prOpenDestinationStatus ?? process.env.PR_OPEN_DEST_STATUS ?? 'Review',
          });
        }
      } else {
        // Branch created
        workflow = new WorkingOnCard({
          eventPayload: payload,
          boardsAndBranchNamePrefixes,
          destinationList: prCloseDestinationList ?? process.env.PR_CLOSE_DEST_LIST ?? 'Doing',
          jiraKeyPrefix,
          destinationStatus: prCloseDestinationStatus ?? process.env.PR_CLOSE_DEST_STATUS ?? 'In Progress',
        });
      }

      if (workflow) {
        result = await workflow.execute();
      }
    }

    return res.json({
      ok: true,
      event: req.header('X-GitHub-Event'),
      result,
    });
  } catch (ex) {
    if (process.env.SLACK_ERROR_WEBHOOK) {
      await postErrorMessage({
        error: ex as Error,
      });
    }

    return res.status(500).json({
      ok: false,
      error: (ex as Error).message,
      stack: (ex as Error).stack,
      response: (ex as AxiosError).response,
      err: ex,
    });
  }
}
