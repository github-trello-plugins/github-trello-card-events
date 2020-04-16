import errorHandler from 'errorhandler';
import express from 'express';
import bodyParser from 'body-parser';

import * as homeController from './controllers/homeController';
import * as deployController from './controllers/deployController';
import * as githubController from './controllers/githubController';

const app = express();

app.set('port', process.env.PORT || 1339);
app.use(bodyParser.json());
app.use(errorHandler());

// Hook up routes
app.get('/', homeController.index);
app.get('/healthcheck', homeController.healthCheck);
// One entry point for all github events
app.get('/github', githubController.index);

// TODO: Remove this legacy url
app.get('/deploy', deployController.index);

app.listen(app.get('port'), () => {
  console.log('Listening at http://localhost:%s', app.get('port'));
});
