const stream = require('stream');
const AWS = require('aws-sdk');
let config = require('fs').existsSync('./config.json') ? require('./config.json') : null;

const accessKeyId = process.env.accessKeyId || config.accessKeyId;
const secretAccessKey = process.env.secretAccessKey || config.secretAccessKey;

const awsConfig = new AWS.Config({
    credentials: new AWS.Credentials({
        accessKeyId,
        secretAccessKey,
    }),
    region: 'us-west-1',
});

if (config.dbLocal="TRUE") {
awsConfig.update({
  endpoint: "http://db:8000"
});
}

const s3 = new AWS.S3(awsConfig);

const ddb = new AWS.DynamoDB({
  ...awsConfig,
  apiVersion: '2012-08-10',
});

const ddbd = new AWS.DynamoDB.DocumentClient({
  ...awsConfig,
  apiVersion: '2012-08-10',
});

module.exports = {
  s3,
  ddb,
  ddbd,
}
