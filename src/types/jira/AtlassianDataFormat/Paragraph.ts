import type { Mark } from './Mark.js';
import type { Text } from './Text.js';

export interface Paragraph {
  type: 'paragraph';
  content: Text[];
  marks?: Mark[];
}
