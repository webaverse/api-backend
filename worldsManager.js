const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const Client = require('ssh2').Client;
const fs = require('fs');
const download = require('download-git-repo');
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
const MAX_INSTANCES = 20;
const MAX_INSTANCES_BUFFER = 2;

const findTag = (tags, key) => {
    let returnTag = null;
    tags.forEach(tag => {
        if (tag.Key === key) {
            returnTag = tag;
            return returnTag;
        }
    })
    return returnTag;
}

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
                    const instance = r.Instances[0];
                    const worldName = findTag(instance.Tags, 'Name')
                    // running or pending
                    if (worldName && (instance.State.Code === 16 || instance.State.Code === 0)) {
                        worldMap.set(worldName.Value, instance);
                    }
                })
                resolve(worldMap);
            } else {
                console.error(error);
                reject();
            }
        })
    })
};

// Create a new ec2 instance, SSH copy the worldSrc into new instance, return host and port.
const createNewWorld = (isBuffer) => {
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
                        },
                        {
                            Key: "IsBuffer",
                            Value: isBuffer.toString()
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
                        conn.sftp(async (error, sftp) => {
                            if (!error) {
                                download('webaverse/world-server/', './world-server', (error) => {
                                    if (!error) {
                                        sftp.fastPut('world-server/package.json', '/home/ubuntu/package.json', (error) => {
                                            if (!error) {
                                                resolve({
                                                    name: 'world-' + uuid,
                                                    host: newInstance.PublicDnsName,
                                                    launchTime: newInstance.LaunchTime,
                                                })
                                            } else {
                                                console.error(error);
                                                reject(error);
                                            }
                                        })
                                    } else {
                                        console.error(error);
                                        reject(error);
                                    }
                                })
                            } else {
                                console.error(error);
                                reject(error);
                            }
                        })
                    }).connect({
                        host: newInstance.PublicDnsName,
                        port: 22,
                        username: 'ubuntu',
                        privateKey: fs.readFileSync('keys/server.pem')
                    });
                }, 30000)
            } else {
                console.error(error);
                reject(error);
            }
        })
    })
};

const deleteWorld = (worldUUID) => {
    return new Promise(async (resolve, reject) => {
        await getWorldList();
        const instanceToDelete = worldMap.get(worldUUID);
        EC2.terminateInstances({ InstanceIds: [instanceToDelete.InstanceId] }, (error, data) => {
            if (!error) {
                console.log(data);
                resolve(data);
            } else {
                console.error(error);
                reject(error);
            }
        })
    })
}

// Routes API requests for interfacing with worlds.
const _handleWorldsRequest = async (req, res) => {
    try {
        const { method } = req;
        if (method === 'POST') {
            const newWorld = await createNewWorld(false);
            if (newWorld) {
                console.log('New World created:', newWorld.name);
                res.statusCode = 200;
                res.end(JSON.stringify(newWorld));
                // createNewWorld(true); // start new buffer world to replace the one we just gave to user.
            } else {
                res.statusCode = 500;
                res.end();
            }
        } else if (method === 'GET') {
            await getWorldList();
            const requestedWorld = worldMap.get('world-03176ebd-f0cd-4965-a9c5-996680104bcd');
            if (requestedWorld) {
                res.statusCode = 200;
                res.end(JSON.stringify({
                    name: requestedWorld.Tags[1].Value,
                    host: requestedWorld.PublicDnsName,
                    launchTime: requestedWorld.LaunchTime,
                }));
            } else {
                console.log('World not found :(');
                res.statusCode = 500;
                res.end();
            }
        } else if (method === 'DELETE') {
            await deleteWorld('world-c5c2cca8-36ca-453a-a146-371dbcdaeba7');
            res.statusCode = 200;
            res.end();
        } else {
            res.statusCode = 404;
            res.end();
        }
    }
    catch (e) {
        console.log(e);
    }
};

const determineWorldBuffer = () => {
    let activeWorlds = 0;
    let bufferedWorlds = 0;
    worldMap.forEach(world => {
        const isBuffer = findTag(world.Tags, 'IsBuffer').Value === 'true';
        if (isBuffer) {
            bufferedWorlds++;
        } else {
            activeWorlds++;
        }
    })
    return {
        activeWorlds: activeWorlds,
        bufferedWorlds: bufferedWorlds
    }
}

const worldsManager = async () => {
    await getWorldList();
    if (worldMap.size > 0) {
        const status = determineWorldBuffer();
        if (status.activeWorlds < MAX_INSTANCES && status.bufferedWorlds < MAX_INSTANCES_BUFFER) {
            createNewWorld(true)
        }
        console.log(`${status.activeWorlds} active Worlds. ${status.bufferedWorlds} buffered Worlds.`);
    } else {
        // spin up buffers from a empty EC2 AWS library. Only happens if we have no worlds for some reason.
        for (let i = 0; i < MAX_INSTANCES_BUFFER; i++) {
            createNewWorld(true)
        }
    }
};

worldsManager();
const managerLoop = setInterval(worldsManager, 5000);

module.exports = {
    _handleWorldsRequest
};
