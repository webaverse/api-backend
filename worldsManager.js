const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const url = require('url');
const util = require('util');
const fs = require('fs');
const { spawn } = require('child_process');
const fetch = require('node-fetch');
const streamPipeline = util.promisify(require('stream').pipeline);
const { accessKeyId, secretAccessKey } = require('./config.json');
const awsConfig = new AWS.Config({
    credentials: new AWS.Credentials({
        accessKeyId,
        secretAccessKey,
    }),
    region: 'us-west-1',
});
const EC2 = new AWS.EC2(awsConfig);
const ELBv2 = new AWS.ELBv2(awsConfig);

let worldMap = new Map();
const MAX_INSTANCES = 20;
const MAX_INSTANCES_BUFFER = 1;
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

// adds instance to elastic load balancer target group, this give the world a URL and routing.
const registerWorld = (instanceId) => {
    return new Promise((resolve, reject) => {
        try {
            const describeParams = {
                TargetGroupArn: "arn:aws:elasticloadbalancing:us-west-1:907263135169:targetgroup/worlds/61962fbb4a031966",
                Targets: [
                    {
                        Id: instanceId,
                        Port: 4443
                    },
                    {
                        Id: instanceId,
                        Port: 80
                    },
                    {
                        Id: instanceId,
                        Port: 443
                    },
                ]
            };
            ELBv2.registerTargets(describeParams, (error, data) => {
                if (!error) {
                    resolve();
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

const pingWorld = (instanceId) => {
    return new Promise((resolve, reject) => {
        try {
            
            const pingDNS = (instanceId) => {
                return new Promise((resolve, reject) => {
                    const describeParams = {
                        InstanceIds: [
                            instanceId
                        ]
                    };
                    EC2.describeInstances(describeParams, (error, data) => {
                        const instance = data.Reservations[0].Instances[0]
                        if (!error && instance) {
                            if (instance.PublicDnsName) {
                                resolve(instance);
                            }
                            resolve(null);
                        } else {
                            console.error(error);
                            reject();
                        }
                    })
                })
            }

            const pingSSH = (ip) => {
                return new Promise((resolve, reject) => {
                    const process = spawn('./testSSH.sh', [ip]);

                    process.stdout.on('data', (data) => {
                        console.log(`stdout: ${data}`);
                    });

                    process.stderr.on('data', (data) => {
                        console.error(`stderr: ${data}`);
                    });

                    process.on('close', (code) => {
                        console.log(code)
                        if (code === 0) {
                            console.log(`SSH connection success.`);
                            resolve(true)
                        }
                    });
                })
            }

            const interval = setInterval(async () => {
                const instance = await pingDNS(instanceId)
                if (instance.PublicIpAddress) {
                    const ssh = await pingSSH(instance.PublicIpAddress)
                    if (ssh) {
                        clearInterval(interval)
                        resolve(instance)
                    }
                }
            }, 5000)

        } catch (e) {
            console.error(e)
        }
    })
}

// Create a new ec2 instance, pull world-server code from Github, SSH copy the code into new instance, return host and other useful metadata for user.
const createNewWorld = (isBuffer) => {
    return new Promise((resolve, reject) => {
        const uuid = uuidv4();
        const worldName = 'world-' + uuid;
        console.time(worldName)
        const instanceParams = {
            ImageId: 'ami-0cd230f950c3de5d8',
            InstanceType: 't3.nano',
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
                            Value: worldName
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
        EC2.runInstances(instanceParams, async (error, data) => {
            if (!error) {
                console.log('New world begun setup:', worldName)
                let newInstance = data.Instances[0]
                console.log('Waiting for IP and SSH to connect...')
                newInstance = await pingWorld(newInstance.InstanceId)
                if (!fs.existsSync('world-server/world-server.zip')) {
                    console.log('Fetching world-server ZIP release:', worldName);
                    const response = await fetch('https://github.com/webaverse/world-server/releases/download/214934477/world-server.zip');
                    if (response.ok) {
                        console.log('Got the ZIP release:', worldName);
                        console.log('Writing ZIP to local file on server:', worldName);
                        await streamPipeline(response.body, fs.createWriteStream('./world-server/world-server.zip'))
                    }
                }
                console.log('Spawning bash script and installing world on EC2:', worldName);
                const process = spawn('./installWorld.sh', [newInstance.PublicDnsName, newInstance.PrivateIpAddress]);

                process.stdout.on('data', (data) => {
                    console.log(`stdout: ${data}`);
                });

                process.stderr.on('data', (data) => {
                    console.error(`stderr: ${data}`);
                });

                process.on('close', async (code) => {
                    console.log(`child process exited with code ${code}`);
                    console.log(`Debug URL: ${newInstance.PublicIpAddress}`);
                    if (code === 0) {
                        console.log('New World successfully created:', worldName, 'IsBuffer: ' + isBuffer);
                        console.timeEnd(worldName)
                        await registerWorld(newInstance.InstanceId)
                        resolve({
                            name: worldName,
                            host: newInstance.PublicDnsName,
                            launchTime: newInstance.LaunchTime,
                        });
                    } else {
                        reject()
                    }
                });
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
    const request = url.parse(req.url)
    const path = request.path.split('/')[2]
    try {
        await getWorldList();
        const { method } = req;
        if (method === 'POST' && path === 'create') {
            const newWorld = getWorldFromBuffer();
            if (newWorld) {
                const worldName = findTag(newWorld.Tags, 'Name').Value;
                console.log('World taken from buffer:', worldName)
                await toggleTag(newWorld.InstanceId, 'IsBuffer', 'false')
                res.statusCode = 200;
                res.end(JSON.stringify({
                    name: worldName,
                    host: newWorld.PublicDnsName,
                    launchTime: newWorld.LaunchTime,
                }));
            } else {
                console.error('No more worlds in buffer :(')
                res.statusCode = 500;
                res.end();
            }
        } else if (method === 'GET' && path) {
            const requestedWorld = worldMap.get(path);
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
        } else if (method === 'DELETE' && path) {
            await deleteWorld(path);
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
        if (status.activeWorlds < MAX_INSTANCES && status.bufferedWorlds < MAX_INSTANCES_BUFFER) {
            for (let i = 0; i < MAX_INSTANCES_BUFFER - status.bufferedWorlds; i++) {
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
