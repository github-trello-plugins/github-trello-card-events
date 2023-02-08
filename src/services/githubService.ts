import { Octokit } from '@octokit/rest';

declare const process: {
  env: {
    GITHUB_TOKEN: string | undefined;
    GITHUB_USER_AGENT: string | undefined;
  };
};

export function getGitHubClient(): Octokit {
  const token = process.env.GITHUB_TOKEN;
  const userAgent = process.env.GITHUB_USER_AGENT;

  if (!token) {
    throw new Error('GITHUB_TOKEN was not defined');
  }

  return new Octokit({
    auth: token,
    userAgent,
    log: console,
  });
}
