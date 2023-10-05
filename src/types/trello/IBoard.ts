import type { IList } from './IList.js';

export interface IBoard {
  id: string;
  name: string;
  lists: IList[];
}
