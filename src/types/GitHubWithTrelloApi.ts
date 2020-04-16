import { Octokit } from '@octokit/rest';
import { IExtendedGitHub } from './IExtendedGitHub';

export type GitHubWithTrelloApi = Octokit & IExtendedGitHub;
