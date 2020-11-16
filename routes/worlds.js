const path = require('path');
const url = require('url');
const https = require('https');
// const { putObject, uploadFromStream } = require('../aws.js');
const crypto = require('crypto');
const child_process = require('child_process');
// const mime = require('mime');
const {_setCorsHeaders, getExt} = require('../utils.js');
const {privateIp, publicIp} = require('../config.json');
const ps = require('ps-node');

const jsPath = '../dialog/index.js';

let worlds = [];
const pidSymbol = Symbol('pid');

const cps = [];

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
const _loadWorlds = async () => {
  worlds = await new Promise((accept, reject) => {
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
};
const loadPromise = _loadWorlds();
const _waitForWorlds = () => loadPromise;
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
          res.end(JSON.stringify(worlds));
        } else if (method === 'POST' && p) {
          const name = p;
          if (!worlds.some(w => w.name === name)) {
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
                NUM_WORKERS: 2,
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
              _loadWorlds();
              cps.splice(cps.indexOf(cp), 1);
            });
            cps.push(cp);

            await _loadWorlds();

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
          const name = p
          const world = worlds.find(w => w.name === name);
          const cp = cps.find(cp => cp.name === name);
          if (world && cp) {
            cp.on('exit', async () => {
              await _loadWorlds();

              res.statusCode = 200;
              res.end();
            });

            cp.kill();
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
  _waitForWorlds,
  _handleWorldsRequest,
}