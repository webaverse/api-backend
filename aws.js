const stream = require('stream');
const AWS = require('aws-sdk');
const {accessKeyId, secretAccessKey} = require('./config.json');
const awsConfig = new AWS.Config({
    credentials: new AWS.Credentials({
        accessKeyId,
        secretAccessKey,
    }),
    region: 'us-west-1',
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

const defaultDynamoTable = 'sidechain-cache';

const getObject = (bucket, key) => {
    return new Promise(async (resolve, reject) => {
        const params = { Bucket: bucket, Key: key };
        s3.getObject(params, (error, data) => {
            if (error) {
                reject(error)
            }
            else {
                resolve(data)
            }
        });
    })
}

const putObject = (bucket, key, data, type) => {
    return new Promise(async (resolve, reject) => {
        const params = { Body: data, Bucket: bucket, Key: key, ACL: 'public-read' };
        if (type) {
          params['ContentType'] = type;
        }
        s3.putObject(params, (error, data) => {
            if (error) {
                reject(error)
            }
            else {
                resolve(data)
            }
        });
    })
}

async function getDynamoItem(id, TableName = defaultDynamoTable) {
  const params = {
    TableName,
    Key: {id: String(id)}
  }

  try {
    return await ddbd.get(params).promise();
  } catch (e) {
    console.error(e);
    return null;
  }
}

async function putDynamoItem(id, data, TableName = defaultDynamoTable) {
  const params = {
    TableName,
    Item: {...data, id: String(id)},
  };

  try {
    return ddbd.put(params).promise();
  } catch (e) {
    console.error(e);
    return false;
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

module.exports = {
  ddb,
  ddbd,
  getDynamoItem,
  putDynamoItem,
  getObject,
  putObject,
  uploadFromStream,
}
