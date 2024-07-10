import type { Mark } from './Mark.js';

export interface Text {
  type: 'text';
  text: string;
  marks?: Mark[];
}
