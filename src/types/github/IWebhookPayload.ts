import { IPayloadRepository } from './IPayloadRepository';
import { IPullRequest } from './IPullRequest';

export interface IWebhookPayload {
  ref: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  ref_type: string;
  repository: IPayloadRepository;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  pull_request?: IPullRequest;
  sender: {
    login: string;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    html_url: string;
    type: string;
  };
  action?: string;
}
