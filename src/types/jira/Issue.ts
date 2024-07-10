import type { Document } from './Document.js';

export interface Issue {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: {
      name: string;
    };
    description: Document;
  };
}
