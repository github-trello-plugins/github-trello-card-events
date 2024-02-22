import { URL } from 'url';

import axios from 'axios';

import type { BlockContent, DocNode } from '../types/jira/AtlassianDataFormat/index.js';
import type { JiraError, Issue, Transition } from '../types/jira/index.js';

declare const process: {
  env: {
    JIRA_EMAIL: string | undefined;
    JIRA_TOKEN: string | undefined;
    JIRA_BASE_URL: string | undefined;
  };
};

export class JiraService {
  public readonly baseUrl: string;

  protected readonly email: string;

  protected readonly token: string;

  public constructor() {
    this.email = process.env.JIRA_EMAIL ?? '';
    if (!this.email) {
      throw new Error('JIRA_EMAIL not defined.');
    }

    this.token = process.env.JIRA_TOKEN ?? '';
    if (!this.token) {
      throw new Error('JIRA_TOKEN not defined.');
    }

    this.baseUrl = process.env.JIRA_BASE_URL ?? '';
    if (!this.baseUrl) {
      throw new Error('JIRA_BASE_URL not defined.');
    }
  }

  public async getIssue(issueIdOrKey: string): Promise<Issue> {
    const getIssueUrl = new URL(`${this.baseUrl}/rest/api/3/issue/${issueIdOrKey}`);

    const issueResponse = await axios.get<Issue | JiraError>(getIssueUrl.href, {
      auth: {
        username: this.email,
        password: this.token,
      },
      timeout: 20000,
    });

    const errorResponse = issueResponse.data as Partial<JiraError>;
    if (errorResponse.errorMessage?.length) {
      throw new Error(`Error fetching jira issue: ${errorResponse.errorMessage.join('\n')}`);
    }

    return issueResponse.data as Issue;
  }

  public async getTransitions(issueIdOrKey: string): Promise<Transition[]> {
    const getIssueUrl = new URL(`${this.baseUrl}/rest/api/3/issue/${issueIdOrKey}/transitions`);

    interface TransitionsResponse {
      transitions: Transition[];
    }

    const issueResponse = await axios.get<JiraError | TransitionsResponse>(getIssueUrl.href, {
      auth: {
        username: this.email,
        password: this.token,
      },
      timeout: 20000,
    });

    const errorResponse = issueResponse.data as Partial<JiraError>;
    if (errorResponse.errorMessage?.length) {
      throw new Error(`Error fetching jira issue: ${errorResponse.errorMessage.join('\n')}`);
    }

    return (issueResponse.data as TransitionsResponse).transitions;
  }

  public async updateIssueStatus({ issueIdOrKey, status }: { issueIdOrKey: string; status: string }): Promise<void> {
    const transitions = await this.getTransitions(issueIdOrKey);

    let transitionId: string | undefined;
    for (const transition of transitions) {
      if (transition.name === status) {
        transitionId = transition.id;
        break;
      }
    }

    if (!transitionId) {
      throw new Error(`Unable to find jira transition for issue ${issueIdOrKey} matching status: ${status}. Available transitions: ${transitions.map((transition) => transition.name).join(', ')}`);
    }

    await axios.post(
      `${this.baseUrl}/rest/api/3/issue/${issueIdOrKey}/transitions`,
      {
        transition: {
          id: transitionId,
        },
      },
      {
        auth: {
          username: this.email,
          password: this.token,
        },
        timeout: 20000,
      },
    );
  }

  public async addRemoteLinkToIssue({ issueIdOrKey, name, url }: { issueIdOrKey: string; name: string; url: string }): Promise<void> {
    await axios.post(
      `${this.baseUrl}/rest/api/3/issue/${issueIdOrKey}/remotelink`,
      {
        globalId: url,
        object: {
          url,
          title: name,
        },
      },
      {
        auth: {
          username: this.email,
          password: this.token,
        },
        timeout: 20000,
      },
    );
  }

  public async addCommentToIssue({ issueIdOrKey, comment }: { issueIdOrKey: string; comment: BlockContent[] }): Promise<void> {
    const doc: DocNode = {
      type: 'doc',
      version: 1,
      content: comment,
    };

    await axios.post(
      `${this.baseUrl}/rest/api/3/issue/${issueIdOrKey}/comment`,
      {
        body: doc,
      },
      {
        auth: {
          username: this.email,
          password: this.token,
        },
        timeout: 20000,
      },
    );
  }
}
