import { IPayloadRepository } from './IPayloadRepository';
import { IPullRequest } from './IPullRequest';

export interface IWebhookPayload {
  ref: string;
  ref_type: string;
  repository: IPayloadRepository;
  pull_request?: IPullRequest;
  sender: {
    login: string;
    html_url: string;
    type: string;
  };
  action?: string;
}
