import type { TextContent } from './TextContent';

export interface Document {
  type: 'doc';
  version: number;
  content: TextContent[];
}
