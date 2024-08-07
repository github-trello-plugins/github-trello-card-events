import type { BlockContent } from './BlockContent.js';

export interface DocNode {
  type: 'doc';
  version: 1;
  content: BlockContent[];
}
