import type { Request } from 'express';

export interface IRequestWithRawBody extends Request {
  rawBody: Buffer;
}
