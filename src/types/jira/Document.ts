import type { TextContent } from './TextContent.js';

export interface Document {
  type: 'doc';
  version: number;
  content: TextContent[];
}
