import errorHandler from 'errorhandler';
import express from 'express';
import bodyParser from 'body-parser';
import type { IRequestWithRawBody } from './types/IRequestWithRawBody';
import * as homeController from './controllers/homeController';
import * as githubController from './controllers/githubController';

const app = express();

app.disable('x-powered-by');
app.set('port', process.env.PORT || 1339);
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
app.get('/healthcheck', homeController.healthCheck);
// One entry point for all github events
app.post('/github', githubController.index);

app.listen(app.get('port'), () => {
  console.log('Listening at http://localhost:%s', app.get('port'));
});
