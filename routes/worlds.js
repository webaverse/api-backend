const path = require('path');
const url = require('url');
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
const ddb = new AWS.DynamoDB(awsConfig);
const ddbd = new AWS.DynamoDB.DocumentClient(awsConfig);

const jsPath = '../dialog/index.js';

const pidSymbol = Symbol('pid');

let startPort = 4000;
let endPort = 5000;
const findPort = () => {
  if (worlds.length > 0) {
    for (let port = startPort; port < endPort; port++) {
      if (!worlds.some(world => world.port === port)) {
        return port;
      }
    }
    return null;
  } else {
    return startPort;
  }
};
const _waitForWorlds = () => loadPromise;

class WorldManager {
  constructor() {
    this.worlds = [];
    this.childProcesses = [];

    this.loadPromise = _loadWorlds();
  }
  waitForLoad() {
    return this.loadPromise;
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
    if (!this.worlds.some(w => w.name === name)) {
      const port = findPort();
      const cp = child_process.spawn(process.argv[0], [
        jsPath,
        name,
        publicIp,
        privateIp,
        port,
      ], {
        env: {
          PROTOO_LISTEN_PORT: port,
          MEDIASOUP_LISTEN_IP: privateIp,
          MEDIASOUP_ANNOUNCED_IP: publicIp,
          HTTPS_CERT_FULLCHAIN: path.join('..', 'exokit-backend', 'certs', 'fullchain.pem'),
          HTTPS_CERT_PRIVKEY: path.join('..', 'exokit-backend', 'certs', 'privkey.pem'),
          AUTH_KEY: path.join('..', 'exokit-backend', 'certs', 'privkey.pem'),
          // NUM_WORKERS: 2,
        },
      });
      cp.name = name;
      req.pipe(cp.stdin);
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
  }
  async deleteWorld() {
    const world = this.worlds.find(w => w.name === name);

    if (world) {
      const cp = this.childProcesses.find(cp => cp.name === name);
      if (cp) {
        cp.kill();
        await new Promise((accept, reject) => {
          cp.on('exit', async () => {
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
  }
}
const worldManager = new WorldManager();

const _handleWorldsRequest = async (req, res) => {
    try {
        const request = url.parse(req.url);
        const match = request.path.match(/^\/([A-Z]{4})$/);
        const p = match && match[1];
        // const filename = match && match[2];

        res = _setCorsHeaders(res);
        const {method, headers} = req;
        if (method === 'OPTIONS') {
          res.end();
        } else if (method === 'GET' && request.path == '/') {
          res.end(JSON.stringify(worldManager.worlds));
        } else if (method === 'POST' && p) {
          const name = p;
          const world = await worldManager.createWorld(name);

          if (world) {
            res.end(JSON.stringify({result: {
              name,
              publicIp,
              privateIp,
              port,
            }}));
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