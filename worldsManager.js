const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const { accessKeyId, secretAccessKey } = require('./config.json');
const awsConfig = new AWS.Config({
    credentials: new AWS.Credentials({
        accessKeyId,
        secretAccessKey,
    }),
    region: 'us-west-1',
});

const EC2 = new AWS.EC2(awsConfig);

// Routes API requests for interfacing with worlds.
const _handleWorldsRequest = (req, res) => {
    try {
        const { method } = req;
        if (method === 'POST') {
            const uuid = uuidv4();
            const instanceParams = {
                ImageId: 'ami-0cd230f950c3de5d8',
                InstanceType: 't2.nano',
                KeyName: 'Exokit',
                MinCount: 1,
                MaxCount: 1,
                TagSpecifications: [
                    {
                        ResourceType: "instance",
                        Tags: [
                            {
                                Key: "Name",
                                Value: "world-" + uuid
                            }
                        ]
                    }
                ]
            };
            EC2.runInstances(instanceParams, (error, data) => {
                if (!error) {
                    console.log('New World Instance:', data);
                    const newWorld = {
                        uuid: uuid,
                        instanceId: data.Instances[0].InstanceId,
                        privateIp: data.Instances[0].PrivateIpAddress,
                        launchTime: data.Instances[0].LaunchTime
                    }
                    res.statusCode = 200;
                    res.end(JSON.stringify(newWorld));
                }
                else {
                    console.error(error, error.stack)
                    res.statusCode = 500;
                    res.end()
                }
            })
        }
        else if (method === 'GET') {

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

module.exports = {
    _handleWorldsRequest
};
