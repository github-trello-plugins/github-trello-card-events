import type { components as githubTypes } from '@octokit/openapi-types';

import { IPayloadRepository } from './IPayloadRepository';

export interface IWebhookPayload {
  ref: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  ref_type: string;
  repository: IPayloadRepository;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  pull_request?: githubTypes['schemas']['pull-request'];
  sender: {
    login: string;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    html_url: string;
    type: string;
  };
  action?: string;
}
