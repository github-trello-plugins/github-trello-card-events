import type { IList } from './IList';

export interface IBoard {
  id: string;
  name: string;
  lists: IList[];
}
