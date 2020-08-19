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

// Create a new ec2 instance, pull world-server code from Github, SSH copy the code into new instance, return host and other useful metadata for user.
const createNewWorld = (isBuffer) => {
    return new Promise((resolve, reject) => {
        const uuid = uuidv4();
        const worldName = 'world-' + uuid;
        console.time(worldName)
        const instanceParams = {
            ImageId: 'ami-0cd230f950c3de5d8',
            InstanceType: 't3.micro',
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
        EC2.runInstances(instanceParams, (error, data) => {
            if (!error) {
                console.log('New world begun setup:', worldName)
                console.log(`Waiting for public DNS to resolve for ${DNS_WAIT_TIME / 1000} seconds...`)
                setTimeout(async () => { // to-do change this to a poll method to get publicDNS
                    await getWorldList();
                    const newInstance = worldMap.get(worldName);
                    console.log('SCP transfer started:', worldName);
                    const response = await fetch('https://github.com/webaverse/world-server/releases/download/214667748/world-server.zip');
                    if (response.ok) {
                        await streamPipeline(response.body, fs.createWriteStream('./world-server/world-server.zip'))
                    }

                    const process = spawn('./installWorld', [newInstance.PublicDnsName, newInstance.PrivateIpAddress]);

                    process.stdout.on('data', (data) => {
                        console.log(`stdout: ${data}`);
                    });

                    process.stderr.on('data', (data) => {
                        console.error(`stderr: ${data}`);
                    });

                    process.on('close', (code) => {
                        console.log(`child process exited with code ${code}`);
                    });

                    // exec(`scp -o StrictHostKeyChecking=no -i keys/server.pem world-server.zip ubuntu@${newInstance.PublicDnsName}:~`, (error, stdout, stderr) => {
                    //     if (error) {
                    //         console.error(`Error with SCP transfer on: ${worldName} Error: ${error}`);
                    //         reject();
                    //     } else {
                    //         console.log(`stdout: ${stdout}`);
                    //         console.error(`stderr: ${stderr}`);
                    //         console.log('SCP file transfer complete:', worldName)
                    //         console.log('Installing dependencies and booting dialog server:', worldName)
                    //         exec(`ssh -o StrictHostKeyChecking=no -i keys/server.pem -t ubuntu@${newInstance.PublicDnsName} 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh | bash && export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" && [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion" && nvm install 14 && nvm use 14 && cd worldSrc/ && sudo apt-get dist-upgrade -y && sudo apt-get update -y && sudo apt-get install build-essential -y && sudo apt-get install python -y && sudo apt-get install python3 -y && npm i && npm i forever -g && mkdir node_modules/dialog/certs/ && cp -r certs/ node_modules/dialog/ && cd node_modules/dialog/ && MEDIASOUP_LISTEN_IP=${newInstance.PrivateIpAddress} MEDIASOUP_ANNOUNCED_IP=${newInstance.PrivateIpAddress} DEBUG=\${DEBUG:='*mediasoup* *INFO* *WARN* *ERROR*'} INTERACTIVE=\${INTERACTIVE:='false'} forever start index.js'`, (error, stdout, stderr) => {
                    //             if (error) {
                    //                 console.error(`Error with Installing dependencies on: ${worldName} Error: ${error}`);
                    //                 reject();
                    //             } else {
                    //                 console.log(`stdout: ${stdout}`);
                    //                 console.error(`stderr: ${stderr}`);
                    //                 console.log('New World successfully created:', worldName, 'IsBuffer: ' + isBuffer);
                    //                 console.timeEnd(worldName)
                    //                 resolve({
                    //                     name: worldName,
                    //                     host: newInstance.PublicDnsName,
                    //                     launchTime: newInstance.LaunchTime,
                    //                 });
                    //             }
                    //         });
                    //     }
                    // })
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
