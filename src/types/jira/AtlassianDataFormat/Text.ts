import type { Mark } from './Mark';

export interface Text {
  type: 'text';
  text: string;
  marks?: Mark[];
}
