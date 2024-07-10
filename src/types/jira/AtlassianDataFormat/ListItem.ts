import type { Paragraph } from './Paragraph.js';

export interface ListItem {
  type: 'listItem';
  content: Omit<Paragraph, 'marks'>[];
}
