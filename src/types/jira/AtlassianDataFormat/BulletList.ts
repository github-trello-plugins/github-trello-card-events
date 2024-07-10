import type { ListItem } from './ListItem.js';

export interface BulletList {
  type: 'bulletList';
  content: ListItem[];
}
