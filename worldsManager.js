const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const Client = require('ssh2').Client;
const { accessKeyId, secretAccessKey } = require('./config.json');
const awsConfig = new AWS.Config({
    credentials: new AWS.Credentials({
        accessKeyId,
        secretAccessKey,
    }),
    region: 'us-west-1',
});
const EC2 = new AWS.EC2(awsConfig);

const worldMap = new Map();

// searchs through all of our ec2 instances and makes Map of worlds with their unique name as the key.
const fetchWorldList = () => {
    const describeParams = {
        Filters: [
            {
                Name: "tag:Purpose",
                Values: [
                    "world"
                ]
            }
        ]
    };
    EC2.describeInstances(describeParams, (error, data) => {
        if (!error) {
            data.Reservations[0].Instances.forEach(instance => {
                instance.Tags.forEach(tag => {
                    if (tag.Name === 'Purpose' && tag.Value === 'world') {
                        worldMap.set(tag.Value, instance)
                    }
                })
            })
            // console.log(worldMap)
        }
        else {
            console.error(error, error.stack)
        }
    })
}

fetchWorldList();

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
                            },
                            {
                                Key: "Purpose",
                                Value: "world"
                            }
                        ]
                    }
                ]
            };
            EC2.runInstances(instanceParams, (error, data) => {
                if (!error) {
                    // console.log('New World Instance:', data);
                    const conn = new Client();
                    ssh.on('ready', function () {
                        conn.sftp(function (err, sftp) {
                            // if (err) throw err;
                            // sftp.readdir('foo', function (err, list) {
                            //     if (err) throw err;
                            //     console.dir(list);
                            //     conn.end();
                            // });
                        }).connect({
                            host: data.Instances[0].PrivateIpAddress,
                            port: 22,
                            username: 'ubuntu',
                            privateKey: require('fs').readFileSync('/here/is/my/key')
                        });
                        const newWorld = {
                            worldName: 'world' + uuid,
                            launchTime: data.Instances[0].LaunchTime
                        }
                        res.statusCode = 200;
                        res.end(JSON.stringify(newWorld));
                    })
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
