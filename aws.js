const AWS = require('aws-sdk');
const { accessKeyId, secretAccessKey } = require('./config.json');
const awsConfig = new AWS.Config({
    credentials: new AWS.Credentials({
        accessKeyId,
        secretAccessKey,
    }),
    region: 'us-west-1',
});
const s3 = new AWS.S3(awsConfig);

const getObject = (bucket, key) => {
    return new Promise(async (resolve, reject) => {
        const params = { Bucket: bucket, Key: key };
        s3.getObject(params, (error, data) => {
            if (error) {
                resolve(error)
            }
            else {
                resolve(data)
            }
        });
    })
}

const putObject = (bucket, key, data) => {
    return new Promise(async (resolve, reject) => {
        const params = { Body: data, Bucket: bucket, Key: key };
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

module.exports = {
    getObject,
    putObject
}
