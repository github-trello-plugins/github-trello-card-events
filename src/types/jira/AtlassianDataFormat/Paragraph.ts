import type { Mark } from './Mark';
import type { Text } from './Text';

export interface Paragraph {
  type: 'paragraph';
  content: Text[];
  marks?: Mark[];
}
