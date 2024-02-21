import type { Document } from './Document';

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
