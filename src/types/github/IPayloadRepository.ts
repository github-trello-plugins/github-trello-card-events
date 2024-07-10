export interface IPayloadRepository {
  full_name?: string;
  name: string;
  owner: {
    login: string;
    name?: string;
  };
  html_url?: string;
}
