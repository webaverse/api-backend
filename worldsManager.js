const AWS = require('aws-sdk');
const { accessKeyId, secretAccessKey } = require('./config.json');
const awsConfig = new AWS.Config({
    credentials: new AWS.Credentials({
        accessKeyId,
        secretAccessKey,
    }),
    region: 'us-west-1',
});
const ec2 = new AWS.EC2(awsConfig);

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
        const { method } = req;
        if (method === 'GET') {
            const instanceParams = {
                ImageId: 'AMI_ID',
                InstanceType: 't2.micro',
                KeyName: 'KEY_PAIR_NAME',
                MinCount: 1,
                MaxCount: 1
            };
            const instancePromise = new AWS.EC2(awsConfig).runInstances(instanceParams).promise();
            instancePromise.then(data => {
                console.log(data);
                const instanceId = data.Instances[0].InstanceId;
                console.log("Created instance", instanceId);
                // Add tags to the instance
                const tagParams = {
                    Resources: [instanceId], 
                    Tags: [
                        {
                            Key: 'Name',
                            Value: 'SDK Sample'
                        }
                    ]
                };
                // Create a promise on an EC2 service object
                const tagPromise = new AWS.EC2(awsConfig).createTags(tagParams).promise();
                // Handle promise's fulfilled/rejected states
                tagPromise.then(data => {
                    console.log("Instance tagged");
                })
                .catch(err => {
                    console.error(err, err.stack);
                });
            })
            .catch(e => {
                console.error(err, err.stack);
            });
        }
        else if (method === 'POST') {

        }
        else if (method === 'DELETE') {

        }   
        else {
            
        }
    }

    catch (e) {
        console.log(e);
    }
}

__worldsManager();

module.exports = {
    __handleWorldsRequest
};
