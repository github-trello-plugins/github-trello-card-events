import { URL } from 'url';

import axios from 'axios';

import type { JiraError, Issue } from '../types/jira/index.js';

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

  public async updateIssue({ issueIdOrKey, status }: { issueIdOrKey: string; status: string }): Promise<void> {
    const updateFields: Partial<Issue['fields']> = {
      status: {
        name: status,
      },
    };

    await axios.put(
      `${this.baseUrl}/rest/api/3/issue/${issueIdOrKey}`,
      {
        fields: updateFields,
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

  public async addCommentToIssue({ issueIdOrKey, text }: { issueIdOrKey: string; text: string }): Promise<void> {
    await axios.post(
      `${this.baseUrl}/rest/api/3/issue/${issueIdOrKey}/comment`,
      {
        body: text,
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
