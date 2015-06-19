var app = require('express')();
var bodyParser = require('body-parser');

app.use(bodyParser.json());         

app.post('/', function (req, res) {
  console.log(req.body);
  res.send({ status: 'I have received the message.' })
});

var server = app.listen(process.env.PORT);

