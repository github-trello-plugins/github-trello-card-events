import type { ListItem } from './ListItem';

export interface BulletList {
  type: 'bulletList';
  content: ListItem[];
}
