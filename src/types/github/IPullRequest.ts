export interface IPullRequest {
  number: number;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  html_url: string;
  body?: string;
  head: {
    ref: string;
  };
  labels: {
    name: string;
  }[];
}
