var app = require('express')();
var bodyParser = require('body-parser');
//var Trello = require('node-trello');

//var devKey = process.env.DEV_KEY;
//var appToken = process.env.APP_TOKEN;
//var trello = new Trello(devKey, appToken);

app.use(bodyParser.json());

app.post('/', function (req, res) {
  console.log(req.body);
  res.send({status: 'I have received the message.'});
});

app.listen(process.env.PORT);

