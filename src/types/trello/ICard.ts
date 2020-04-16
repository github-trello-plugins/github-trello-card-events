import { ILabel } from './ILabel';

export interface ICard {
  id: string;
  closed: boolean;
  name: string;
  url: string;
  idBoard: string;
  idList: string;
  idShort: number;
  shortUrl: string;
  labels: ILabel[];
}
