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

let worldMap = new Map();
const MAX_INSTANCES = 20;
const MAX_INSTANCES_BUFFER = 2;
const DNS_WAIT_TIME = 45000;

// Finds a tag by key in random ordered array of tags.
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
        try {
            const describeParams = {
                Filters: [
                    {
                        Name: "tag:Purpose",
                        Values: ["world"]
                    }
                ]
            };
            EC2.describeInstances(describeParams, (error, data) => {
                if (!error && data.Reservations) {
                    worldMap = new Map();
                    data.Reservations.forEach(r => {
                        const instance = r.Instances[0];
                        const worldName = findTag(instance.Tags, 'Name')
                        if (worldName && (instance.State.Code === 16 || instance.State.Code === 0)) { // running or pending
                            worldMap.set(worldName.Value, instance);
                        }
                    })
                    resolve(worldMap);
                } else {
                    console.error(error);
                    reject();
                }
            })
        } catch (e) {
            console.error(e)
        }
    })
};

// Create a new ec2 instance, pull world-server code from Github, SSH copy the code into new instance, return host and other useful metadata for user.
const createNewWorld = (isBuffer) => {
    return new Promise((resolve, reject) => {        
        const uuid = uuidv4();
        console.time('world-' + uuid)
        const instanceParams = {
            ImageId: 'ami-0cd230f950c3de5d8',
            InstanceType: 't2.micro',
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
                console.log(`New world begun setup: world-${uuid}`)
                console.log(`Waiting for public DNS to resolve for ${DNS_WAIT_TIME / 1000} seconds...`)
                setTimeout(async () => {
                    await getWorldList();
                    const newInstance = worldMap.get('world-' + uuid);
                    const conn = new Client();
                    conn.on('ready', () => {
                        console.log(`SSH connected: world-${uuid}`)
                        conn.sftp(async (error, sftp) => {
                            if (!error) {
                                console.log(`SFTP connected: world-${uuid}`)
                                sftp.fastPut('world-server/package.json', '/home/ubuntu/package.json', (error) => {
                                    if (!error) {
                                        console.log(`package.json uploaded to: world-${uuid}`)
                                        conn.exec('sudo apt-get update -y && sudo apt-get upgrade -y && sudo apt-get install build-essential -y && sudo apt-get install python -y && sudo apt-get install python3 -y && curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh | bash && export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" && [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion" && nvm install 14 && nvm use 14 && npm install', (error, stream) => {
                                            if (!error) {
                                                stream.close();
                                                conn.end();
                                                console.log('New World successfully created:', 'world-' + uuid, 'IsBuffer: ' + isBuffer);
                                                console.timeEnd('world-' + uuid)
                                                resolve({
                                                    name: 'world-' + uuid,
                                                    host: newInstance.PublicDnsName,
                                                    launchTime: newInstance.LaunchTime,
                                                });
                                            } else {
                                                console.error(error)
                                            }
                                        });
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
                }, DNS_WAIT_TIME)
            } else {
                console.error(error);
                reject(error);
            }
        })
    })
};

// Finds a world in our Map with the UUID key and terminates the AWS instance
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

const getWorldFromBuffer = () => {
    let world = null;
    worldMap.forEach(w => {
        const isBuffer = findTag(w.Tags, 'IsBuffer').Value;
        if (isBuffer === 'true') {
            world = w;
            return w;
        }
    })
    return world;
}

// changes a Tag value in AWS.
const toggleTag = (instanceId, key, value) => {
    return new Promise((resolve, reject) => {
        const params = {
            Resources: [
                instanceId
            ],
            Tags: [
                {
                    Key: key,
                    Value: value
                }
            ]
        };
        EC2.createTags(params, (error, data) => {
            if (!error) {
                resolve(data)
            } else {
                console.error(error)
                reject(error)
            }
        })
    })
}

// Routes API requests for interfacing with worlds.
const _handleWorldsRequest = async (req, res) => {
    try {
        await getWorldList();
        const { method } = req;
        if (method === 'POST') {
            const newWorld = getWorldFromBuffer();
            if (newWorld) {
                const worldName = findTag(newWorld.Tags, 'Name').Value;
                console.log('World taken from buffer:', worldName)
                res.statusCode = 200;
                res.end(JSON.stringify({
                    name: worldName,
                    host: newWorld.PublicDnsName,
                    launchTime: newWorld.LaunchTime,
                }));
                await toggleTag(newWorld.InstanceId, 'IsBuffer', 'false')
            } else {
                console.error('No more worlds in buffer :(')
                res.statusCode = 500;
                res.end();
            }
        } else if (method === 'GET') {
            const requestedWorld = worldMap.get('world-03176ebd-f0cd-4965-a9c5-996680104bcd');
            if (requestedWorld) {
                res.statusCode = 200;
                res.end(JSON.stringify({
                    name: findTag(requestedWorld.Tags, 'Name').Value,
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

// Searches through our Map of worlds, counts the ones who have IsBuffer = true | false attached as AWS instance Tag. Useful for buffer math.
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

// Polls the world list from AWS. Determines if buffer is OK and if we need to make more buffered instances. Useful for server reboot and monitoring.
const worldsManager = async () => {
    try {
        await getWorldList();
        const status = determineWorldBuffer();
        if (worldMap.size > 0) {
            if (status.activeWorlds < MAX_INSTANCES && status.bufferedWorlds < MAX_INSTANCES_BUFFER) {
                for (let i = 0; i < MAX_INSTANCES_BUFFER; i++) {
                    createNewWorld(true)
                }
            }
        } else {
            // spin up buffers from a empty EC2 AWS library. Only happens if we have no worlds for some reason.
            for (let i = 0; i < MAX_INSTANCES_BUFFER; i++) {
                createNewWorld(true)
            }
        }
        console.log(`${status.activeWorlds} active Worlds. ${status.bufferedWorlds} buffered Worlds.`);
    } catch (e) {
        console.error(e);
    }
};

worldsManager();
const managerLoop = setInterval(worldsManager, 5000);

module.exports = {
    _handleWorldsRequest
};
