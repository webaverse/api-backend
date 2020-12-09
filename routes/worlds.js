const path = require('path');
const url = require('url');
const fs = require('fs').promises;
// const https = require('https');
// const { putObject, uploadFromStream } = require('../aws.js');
// const crypto = require('crypto');
const child_process = require('child_process');
// const mime = require('mime');
const {_setCorsHeaders, getExt} = require('../utils.js');
const AWS = require('aws-sdk');
const ps = require('ps-node');
const config = require('../config.json');
const {privateIp, publicIp, accessKeyId, secretAccessKey, /*githubUsername, githubApiKey,*/ githubPagesDomain, githubClientId, githubClientSecret, discordClientId, discordClientSecret, stripeClientId, stripeClientSecret, infuraNetwork, infuraProjectId} = config;
const awsConfig = new AWS.Config({
  credentials: new AWS.Credentials({
    accessKeyId,
    secretAccessKey,
  }),
  region: 'us-west-1',
});
// const ddb = new AWS.DynamoDB(awsConfig);
// const ddbd = new AWS.DynamoDB.DocumentClient(awsConfig);
const s3 = new AWS.S3(awsConfig);

const jsPath = '../dialog/index.js';
const bucketName = 'worlds.exokit.org';
const pidSymbol = Symbol('pid');

let startPort = 4000;
let endPort = 5000;

class WorldManager {
  constructor() {
    this.worlds = [];
    this.childProcesses = [];
    this.runnings = {};
    this.queues = {};

    this.loadPromise = this.loadWorlds();
  }
  waitForLoad() {
    return this.loadPromise;
  }
  findPort() {
    if (this.worlds.length > 0) {
      for (let port = startPort; port < endPort; port++) {
        if (!this.worlds.some(world => world.port === port)) {
          return port;
        }
      }
      return null;
    } else {
      return startPort;
    }
  }
  async loadWorlds() {
    this.worlds = await new Promise((accept, reject) => {
      ps.lookup({
        command: 'node',
        // psargs: 'ux',
      }, function(err, results) {
        if (!err) {
          results = results.filter(w => {
            return w.arguments[0] === jsPath;
          }).map(w => {
            const {pid} = w;
            let [_, name, publicIp, privateIp, port] = w.arguments;
            port = parseInt(port, 10);
            return {
              name,
              publicIp,
              privateIp,
              port,
              [pidSymbol]: pid,
            };
          });
          accept(results);
        } else {
          /* resultList.forEach(function( process ){
            if( process ){
              console.log( 'PID: %s, COMMAND: %s, ARGUMENTS: %s', process.pid, process.command, process.arguments );
            }
          }); */
          reject(err);
        }
      });
    });
  }
  async createWorld(name) {
    if (!this.runnings[name]) {
      this.runnings[name] = true;

      try {
        if (!this.worlds.some(w => w.name === name)) {
          let b;
          try {
            const o = await s3.getObject({
              Bucket: bucketName,
              Key: name,
            }).promise();
            console.log('got object', o);
            b = o.Body;
          } catch(err) {
            if (err.code === 'NoSuchKey') {
              // nothing
            } else {
              console.warn(err.stack);
            }
            b = null;
          }
          const dataFilePath = path.join(path.dirname(jsPath), 'data', name + '.bin');
          // console.log('placing data', b && b.byteLength);
          if (b) {
            await fs.writeFile(dataFilePath, b); 
          }

          const port = this.findPort();
          const cp = child_process.spawn(process.argv[0], [
            jsPath,
            name,
            publicIp,
            privateIp,
            port,
          ], {
            cwd: path.dirname(jsPath),
            env: {
              PROTOO_LISTEN_PORT: port,
              MEDIASOUP_LISTEN_IP: privateIp,
              MEDIASOUP_ANNOUNCED_IP: publicIp,
              HTTPS_CERT_FULLCHAIN: path.join('..', 'exokit-backend', 'certs', 'fullchain.pem'),
              HTTPS_CERT_PRIVKEY: path.join('..', 'exokit-backend', 'certs', 'privkey.pem'),
              AUTH_KEY: path.join('..', 'exokit-backend', 'certs', 'privkey.pem'),
              DATA_FILE: dataFilePath,
              // NUM_WORKERS: 2,
            },
          });
          cp.name = name;
          cp.dataFilePath = dataFilePath;
          cp.stdin.end();
          cp.stdout.pipe(process.stdout);
          cp.stderr.pipe(process.stderr);
          cp.on('error', err => {
            console.log('cp error', err.stack);
          });
          cp.on('exit', code => {
            console.log('cp exit', code);
            this.loadWorlds();
            this.childProcesses.splice(this.childProcesses.indexOf(cp), 1);
          });
          this.childProcesses.push(cp);

          await new Promise((accept, reject) => {
            cp.stdout.setEncoding('utf8');
            const _data = s => {
              if (/ready\n/.test(s)) {
                console.log('got dialog ready');

                accept();
                cp.stdout.removeListener('data', _end);
                cp.stdout.removeListener('end', _end);
              }
            };
            cp.stdout.on('data', _data);
            const _end = () => {
              reject(new Error('dialog did not output ready'));
            };
            cp.stdout.on('end', _end);
          });

          await this.loadWorlds();

          return {
            name,
            publicIp,
            privateIp,
            port,
          };
        } else {
          return null;
        }
      } finally {
        this.runnings[name] = false;

        const queue = this.queues[name] || [];
        if (queue.length > 0) {
          queue.splice(0, 1)();
        }
      }
    } else {
      return await new Promise((accept, reject) => {
        this.queues.push(async () => {
          const world = await this.createWorld(name);
          accept(world);
        });
      });
    }
  }
  async deleteWorld(name) {
    if (!this.runnings[name]) {
      this.runnings[name] = true;

      try {
        const world = this.worlds.find(w => w.name === name);

        if (world) {
          const cp = this.childProcesses.find(cp => cp.name === name);
          if (cp) {
            cp.kill();

            await new Promise((accept, reject) => {
              cp.on('exit', async () => {
                const b = await fs.readFile(cp.dataFilePath);
                await s3.putObject({
                  Bucket: bucketName,
                  Key: name,
                  ContentType: 'application/octet-stream',
                  ContentLength: b.length,
                  Body: b,
                }).promise();

                await fs.unlink(cp.dataFilePath);

                accept();
              });
            });
            return true;
          } else {
            return false;
          }
        } else {
          return false;
        }
      } finally {
        this.runnings[name] = false;

        const queue = this.queues[name] || [];
        if (queue.length > 0) {
          queue.splice(0, 1)();
        }
      }
    } else {
      return await new Promise((accept, reject) => {
        this.queues.push(async () => {
          const result = await this.deleteWorld(name);
          accept(result);
        });
      });
    }
  }
}
const worldManager = new WorldManager();

const _handleWorldsRequest = async (req, res) => {
    try {
        const request = url.parse(req.url);
        const match = request.path.match(/^\/([a-z0-9]+)$/i);
        const p = match && match[1];
        // const filename = match && match[2];

        res = _setCorsHeaders(res);
        const {method, headers} = req;
        if (method === 'OPTIONS') {
          res.end();
        } else if (method === 'GET' && request.path == '/') {
          res.end(JSON.stringify(worldManager.worlds));
        } else if (method === 'GET' && p) {
          const name = p;
          const world = worldManager.worlds.find(world => world.name === name);
          if (world) {
            res.end(JSON.stringify({
              result: world,
            }));
          } else {
            res.statusCode = 404;
            res.end(JSON.stringify({error: 'world not found'}));
          }
        } else if (method === 'POST' && p) {
          const name = p;
          const world = await worldManager.createWorld(name);

          if (world) {
            res.end(JSON.stringify({
              result: world,
            }));
          } else {
            res.statusCode = 400;
            res.end(JSON.stringify({error: 'name already taken'}));
          }
        } else if (method === 'DELETE' && p) {
          const name = p;
          const ok = await worldManager.deleteWorld(name);
          if (ok) {
            res.statusCode = 200;
            res.end();
          } else {
            res.statusCode = 404;
            res.end(JSON.stringify({error: 'world not found'}));
          }
        } else {
          res.statusCode = 404;
          res.end();
        }
    } catch (e) {
        console.log(e);
    }
}

module.exports = {
  worldManager,
  _handleWorldsRequest,
}