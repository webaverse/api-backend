const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const Client = require('ssh2').Client;
const fs = require('fs');
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
const getWorldList = () => {
    return new Promise((resolve, reject) => {
        const describeParams = {
            Filters: [
                {
                    Name: "tag:Purpose",
                    Values: ["world"]
                }
            ]
        };
        EC2.describeInstances(describeParams, (error, data) => {
            if (!error && data.Reservations.length > 0) {
                data.Reservations.forEach(r => {
                    worldMap.set(r.Instances[0].Tags[0].Value, r.Instances[0])
                    resolve(worldMap)
                })
            }
            else {
                console.error(error)
                reject()
            }
        })
    })
}

const createNewWorld = () => {
    return new Promise((resolve, reject) => {
        const uuid = uuidv4();
        const instanceParams = {
            ImageId: 'ami-0cd230f950c3de5d8',
            InstanceType: 't2.nano',
            KeyName: 'Exokit',
            MinCount: 1,
            MaxCount: 1,
            SecurityGroupIds: [
                "sg-0c41f4cc265915ed7"
            ],
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
                setTimeout(async () => {
                    await getWorldList();
                    const newInstance = worldMap.get('world-' + uuid);
                    const conn = new Client();
                    conn.on('ready', () => {
                        conn.sftp((error, sftp) => {
                            if (!error) {
                                sftp.fastPut('worldSrc/package.json', '/home/ubuntu/package.json', (error) => {
                                    if (error) {
                                        console.error(error)
                                        reject(error)
                                    }
                                })
                            }
                            else {
                                console.error(error)
                                reject(error)
                            }
                        })
                        resolve({
                            name: 'world-' + uuid,
                            host: newInstance.PublicDnsName,
                            launchTime: newInstance.LaunchTime,
                        }) 
                    }).connect({
                        host: newInstance.PublicDnsName,
                        port: 22,
                        username: 'ubuntu',
                        privateKey: fs.readFileSync('keys/server.pem')
                    });
                }, 30000)
            }
            else {
                console.error(error)
                reject(error)
            }
        })
    })
}

// Routes API requests for interfacing with worlds.
const _handleWorldsRequest = async (req, res) => {
    try {
        const { method } = req;
        // Create a new ec2 instance, SSH copy the worldSrc into new instance, return host and port.
        if (method === 'POST') {
            const newWorld = await createNewWorld();
            if (newWorld) {
                console.log('New World created:', newWorld.name)
                res.statusCode = 200;
                res.end(JSON.stringify(newWorld));
            }
            else {
                res.statusCode = 500;
                res.end();
            }
        }
        else if (method === 'GET') {
            await getWorldList();
            // to-do use the proper URL param from request
            const requestedWorld = worldMap.get('lol');
            if (requestedWorld) {
                res.statusCode = 200;
                res.end(JSON.stringify({
                    name: requestedWorld.Tags[1].Value,
                    host: requestedWorld.PublicDnsName,
                    launchTime: requestedWorld.LaunchTime,
                }));
            }
            else {
                console.log('World not found :(')
                res.statusCode = 500;
                res.end();
            }
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

const worldsManager = async () => {
    await getWorldList()
    const activeWorlds = new Map()
    worldMap.forEach(world => {
        // running or pending
        if (world.State.Code === 16 || world.State.Code === 0) {
            activeWorlds.set(world.Tags[1].Value, world)
        }
    })
    console.log(`World Manager Online! ${activeWorlds.size} active World(s)`)
}

worldsManager()

module.exports = {
    _handleWorldsRequest
};
