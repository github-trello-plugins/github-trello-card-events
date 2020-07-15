export interface IPayloadRepository {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  full_name?: string;
  name: string;
  owner: {
    login: string;
    name?: string;
  };
  // eslint-disable-next-line @typescript-eslint/naming-convention
  html_url?: string;
}
