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

// handles tracking and monitoring of worlds, reboots and errors.
const __worldsManager = (req) => {

}

// Routes API requests for interfacing with worlds.
const __handleWorldsRequest = (req, res) => {
    const _respond = (statusCode, body) => {
        res.statusCode = statusCode;
        _setCorsHeaders(res);
        res.end(body);
    };
    const _setCorsHeaders = res => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Access-Control-Allow-Methods', '*');
    };

    try {

    }

    catch (e) {
        console.log(e);
    }
}

__worldsManager();

module.exports = {
    __handleWorldsRequest
};
