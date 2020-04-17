import { Octokit } from '@octokit/rest';

export function getGitHubClient(): Octokit {
  const token = process.env.GITHUB_TOKEN;
  const userAgent = process.env.GITHUB_USER_AGENT;

  if (!token) {
    throw new Error('GITHUB_TOKEN was not defined');
  }

  return new Octokit({
    auth: `token ${token}`,
    userAgent,
    log: console,
  });
}
