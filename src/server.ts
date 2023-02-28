import bodyParser from 'body-parser';
import errorHandler from 'errorhandler';
import express from 'express';

import * as githubController from './controllers/githubController';
import * as homeController from './controllers/homeController';
import type { IRequestWithRawBody } from './types/IRequestWithRawBody';

declare const process: {
  env: {
    PORT?: string;
  };
};

const app = express();

app.disable('x-powered-by');
app.set('port', process.env.PORT || 8080);
app.use(
  bodyParser.json({
    verify(req: IRequestWithRawBody, _: express.Response, rawBody: Buffer) {
      req.rawBody = rawBody;
    },
  }),
);
app.use(errorHandler());

// Hook up routes
app.get('/', homeController.index);
// eslint-disable-next-line @typescript-eslint/no-misused-promises
app.get('/healthcheck', homeController.healthCheck);
// One entry point for all github events
// eslint-disable-next-line @typescript-eslint/no-misused-promises
app.post('/github', githubController.index);

app.listen(app.get('port'), () => {
  console.log('Listening at http://localhost:%s', app.get('port'));
});
