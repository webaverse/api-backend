const AWS = require('aws-sdk');
const crypto = require('crypto');
const url = require('url');
const util = require('util');
const fs = require('fs');
const { spawn } = require('child_process');
const fetch = require('node-fetch');
const streamPipeline = util.promisify(require('stream').pipeline);
const { accessKeyId, secretAccessKey } = require('../config.json');
const awsConfig = new AWS.Config({
    credentials: new AWS.Credentials({
        accessKeyId,
        secretAccessKey,
    }),
    region: 'us-west-1',
});
const EC2 = new AWS.EC2(awsConfig);
const route53 = new AWS.Route53(awsConfig);

const MAX_INSTANCES = 10;
const MAX_INSTANCES_BUFFER = 1;

const worldMap = new Map();

// Polls the world list from AWS. Determines if buffer is OK and if we need to make more buffered instances. Useful for server reboot and monitoring.
const worldsManager = async () => {
    const status = await determineWorldBuffer();
    if (status.activeWorlds < MAX_INSTANCES && status.bufferedWorlds < MAX_INSTANCES_BUFFER) {
        for (let i = 0; i < MAX_INSTANCES_BUFFER - status.bufferedWorlds; i++) {
            createNewWorld(true)
        }
    }
    console.log(`${status.activeWorlds} active Worlds. ${status.bufferedWorlds} buffered Worlds.`);
};

// Finds a tag by key in random ordered array of tags.
const findTag = (tags, key) => {
    return new Promise((resolve, reject) => {
        tags.forEach(t => {
            if (t.Key === key) {
                resolve(t);
            }
        })
        resolve(null);
    })
}

const assignRoute = (worldName, publicIp) => {
    return new Promise((resolve, reject) => {
        const params = {
            ChangeBatch: {
             Changes: [
                {
               Action: "UPSERT", 
               ResourceRecordSet: {
                Name: `${worldName}.worlds.webaverse.com`,
                ResourceRecords: [
                   {
                  Value: publicIp
                 }
                ], 
                TTL: 60, 
                Type: "A"
               }
              }
             ], 
            }, 
            HostedZoneId: "Z01849492NCNCK33I1QM7"
           };
           route53.changeResourceRecordSets(params, (error, data) => {
             if (error) {
                console.log(error, error.stack);
                reject();
             } else {
                resolve(data);
             }
           });
    })
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
                    data.Reservations.forEach(async (r) => {
                        const instance = r.Instances[0];
                        const worldName = await findTag(instance.Tags, 'Name');
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

const pingWorld = (instanceId) => {
    return new Promise((resolve, reject) => {
        let isSession = false;
        let isResolved = false;

        const pingDNS = (instanceId) => {
            return new Promise((resolve, reject) => {
                isSession = true;
                const describeParams = {
                    InstanceIds: [
                        instanceId
                    ]
                };
                EC2.describeInstances(describeParams, (error, data) => {
                    const instance = data.Reservations[0].Instances[0]
                    if (instance && instance.PublicIpAddress) {
                        resolve(instance);
                    } else {
                        resolve(null);
                    }
                    isSession = false;
                })
            })
        }

        const pingSSH = (ip) => {
            return new Promise((resolve, reject) => {
                isSession = true;
                const process = spawn('./testSSH.sh', [ip]);

                process.stdout.on('data', (data) => {
                    // console.log(`stdout: ${data}`);
                });

                process.stderr.on('data', (data) => {
                    // console.error(`stderr: ${data}`);
                });

                process.on('close', (code) => {
                    if (code === 0) {
                        console.log(`SSH connection success.`);
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                    isSession = false;
                });
            })
        }

        const interval = setInterval(async () => {
            if (!isSession) {
                const instance = await pingDNS(instanceId)
                if (instance.PublicIpAddress) {
                    const ssh = await pingSSH(instance.PublicIpAddress)
                    if (ssh) {
                        if (!isResolved) {
                            isResolved = true;
                            resolve(instance);
                            clearInterval(interval);
                        }
                    }
                }
            }
        }, 1000)
    })
}

// Create a new ec2 instance, pull world-server code from Github, SSH copy the code into new instance, return host and other useful metadata for user.
const createNewWorld = (isBuffer) => {
    return new Promise((resolve, reject) => {
        const worldName = crypto.randomBytes(8).toString('base64').toLowerCase().replace(/[^a-z0-9]+/g, '');
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
                console.log('Assining route to ec2...', worldName + '.worlds.webaverse.com');
                await assignRoute(worldName, newInstance.PublicIpAddress);
                console.log('Spawning bash script and installing world on EC2:', worldName);
                const process = spawn('./installWorld.sh', [newInstance.PublicIpAddress, newInstance.PrivateIpAddress, `${worldName}.worlds.webaverse.com`]);

                process.stdout.on('data', (data) => {
                    console.log(`stdout: ${data}`);
                });

                process.stderr.on('data', (data) => {
                    console.error(`stderr: ${data}`);
                });

                process.on('close', async (code) => {
                    console.log(`child process exited with code ${code}`);
                    console.timeEnd(worldName)
                    console.log(`Debug URL: ${newInstance.PublicIpAddress}`);
                    if (code === 0) {
                        console.log('New World successfully created:', worldName, 'IsBuffer: ' + isBuffer);
                        worldMap.set(worldName, newInstance);
                        resolve({
                            name: worldName,
                            host: newInstance.PublicIpAddress,
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
const deleteWorld = (worldName) => {
    return new Promise(async (resolve, reject) => {
        const instanceToDelete = worldMap.get(worldName);
        EC2.terminateInstances({ InstanceIds: [instanceToDelete.InstanceId] }, (error, data) => {
            if (!error) {
                worldMap.delete(worldName);
                resolve(data);
            } else {
                console.error(error);
                reject(error);
            }
        })
    })
}

const getWorldFromBuffer = () => {
    return new Promise((resolve, reject) => {
        let world = null;
        worldMap.forEach(async (w) => {
            const isBuffer = await findTag(w.Tags, 'IsBuffer').Value;
            if (isBuffer === 'true') {
                world = w;
                resolve(world);
            }
        })
    })
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
                console.log(data)
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
        const { method } = req;
        if (method === 'POST' && path === 'create') {
            const newWorld = await getWorldFromBuffer();
            if (newWorld) {
                const worldName = await findTag(newWorld.Tags, 'Name').Value;
                console.log('World taken from buffer:', worldName)
                await toggleTag(newWorld.InstanceId, 'IsBuffer', 'false')
                res.statusCode = 200;
                res.end(JSON.stringify({
                    name: worldName + '.worlds.webaverse.com',
                    host: newWorld.PublicIpAddress,
                    launchTime: newWorld.LaunchTime,
                }));
            } else {
                console.error('No more worlds in buffer :(')
                res.statusCode = 500;
                res.end();
            }
            worldsManager();
        } else if (method === 'GET' && path) {
            const requestedWorld = worldMap.get(path);
            if (requestedWorld) {
                res.statusCode = 200;
                res.end(JSON.stringify({
                    name: await findTag(requestedWorld.Tags, 'Name').Value + '.worlds.webaverse.com',
                    host: requestedWorld.PublicIpAddress,
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
            worldsManager();
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
    return new Promise((resolve, reject) => {
        let activeWorlds = 0;
        let bufferedWorlds = 0;
        if (worldMap && worldMap.size > 0) {
            Array.from(worldMap.values()).forEach(async (world, index) => {
                const tag = await findTag(world.Tags, 'IsBuffer');
                const isBuffer = tag.Value === 'true';
                isBuffer ? bufferedWorlds++ : activeWorlds++;
                if (index === worldMap.size - 1) {
                    resolve({
                        activeWorlds,
                        bufferedWorlds
                    });
                };
            })
        } else if (worldMap && worldMap.size === 0) {
            resolve({
                activeWorlds,
                bufferedWorlds
            })
        } else if (!worldMap) {
            reject();
        }
    })
}

const updateZipFile = () => {
    return new Promise(async (resolve, reject) => {
        if (!fs.existsSync('./world-server.zip')) {
            console.log('Fetching world-server ZIP release...');
            const response = await fetch('https://github.com/webaverse/world-server/releases/download/260524318/world-server.zip');
            if (response.ok) {
                console.log('Writing ZIP to local file on server...');
                await streamPipeline(response.body, fs.createWriteStream('./world-server.zip'));
                console.log('ZIP written to server successfully!');
                resolve();
            } else {
                console.error('couldnt pull ZIP for some reason:', response);
                reject();
            }
        } else {
            resolve();
        }
    })
}

const main = async () => {
    await updateZipFile();
    await getWorldList();
    worldsManager();
}
main()

module.exports = {
    _handleWorldsRequest
};
