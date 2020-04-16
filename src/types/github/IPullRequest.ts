export interface IPullRequest {
  number: number;
  html_url: string;
  body?: string;
  head: {
    ref: string;
  };
  labels: {
    name: string;
  }[];
}
