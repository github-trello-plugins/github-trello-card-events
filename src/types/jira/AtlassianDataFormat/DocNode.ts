import type { BlockContent } from './BlockContent';

export interface DocNode {
  type: 'doc';
  version: 1;
  content: BlockContent[];
}
