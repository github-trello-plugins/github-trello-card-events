import type { components as githubTypes } from '@octokit/openapi-types';

import type { IPayloadRepository } from './IPayloadRepository.js';

export interface IWebhookPayload {
  ref: string;
  ref_type: string;
  repository: IPayloadRepository;
  pull_request?: githubTypes['schemas']['pull-request'];
  sender?: {
    login: string;

    html_url: string;
    type: string;
  };
  action?: string;
}
