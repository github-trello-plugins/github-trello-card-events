import type { Paragraph } from './Paragraph';

export interface ListItem {
  type: 'listItem';
  content: Omit<Paragraph, 'marks'>[];
}
