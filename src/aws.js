const stream = require('stream');
const AWS = require('aws-sdk');
const { tableNames } = require('./constants.js');

let config = require('fs').existsSync('../config.json') ? require('../config.json') : require('../config.default.json');
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || config.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || config.AWS_SECRET_ACCESS_KEY;
const AWS_REGION = process.env.AWS_REGION || config.AWS_REGION;

const awsConfig = new AWS.Config({
    credentials: new AWS.Credentials({
        AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY,
    }),
    region: AWS_REGION,
});

const s3 = new AWS.S3(awsConfig);

const ddb = new AWS.DynamoDB({
  ...awsConfig,
  apiVersion: '2012-08-10',
});

const ddbd = new AWS.DynamoDB.DocumentClient({
  ...awsConfig,
  apiVersion: '2012-08-10',
});

async function getDynamoItem(id, TableName) {
  const params = {
    TableName,
    Key: {
      id,
    },
  };

  try {
    return await ddbd.get(params).promise();
  } catch (e) {
    console.error(e);
    return null;
  }
}

async function putDynamoItem(id, data, TableName) {
  const params = {
    TableName,
    Item: {
      ...data,
      id,
    },
  };

  try {
    return ddbd.put(params).promise();
  } catch (e) {
    console.error(e);
    return false;
  }
}

async function getDynamoAllItems(TableName = tableNames.defaultCacheTable) {
  const params = {
    TableName,
  };

  try {
    const o = await ddbd.scan(params).promise();
    const items = (o && o.Items) || [];
    return items;
  } catch (e) {
    console.error(e);
    return null;
  }
}

function uploadFromStream(bucket, key, type) {
  const pass = new stream.PassThrough();
  const params = {Bucket: bucket, Key: key, Body: pass, ACL: 'public-read'};
  if (type) {
    params['ContentType'] = type;
  }
  s3.upload(params, function(err, data) {
    console.log('emit done', !!err, !!data);
    if (err) {
      pass.emit('error', err);
    } else {
      pass.emit('done', data);
    }
  });
  return pass;
}

const ses = new AWS.SES(new AWS.Config({
  credentials: new AWS.Credentials({
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
  }),
  region: AWS_REGION,
}));

module.exports = {
  ses,
  ddb,
  ddbd,
  getDynamoItem,
  putDynamoItem,
  getDynamoAllItems,
  uploadFromStream,
}
