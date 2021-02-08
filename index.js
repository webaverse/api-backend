const path = require('path');
const stream = require('stream');
const fs = require('fs');
const url = require('url');
const querystring = require('querystring');
const http = require('http');
const https = require('https');
const dns = require('dns');
const crypto = require('crypto');
const zlib = require('zlib');
const os = require('os');
const child_process = require('child_process');
const mkdirp = require('mkdirp');
const FormData = require('form-data');
// const express = require('express');
const httpProxy = require('http-proxy');
const ws = require('ws');
// const LRU = require('lru');
const request = require('request');
const mime = require('mime');
const AWS = require('aws-sdk');
const Stripe = require('stripe');
// const puppeteer = require('puppeteer');
const namegen = require('./namegen.js');
const Base64Encoder = require('./encoder.js').Encoder;
// const {JSONServer, CustomEvent} = require('./dist/sync-server.js');
const fetch = require('node-fetch');
const {SHA3} = require('sha3');
const {default: formurlencoded} = require('form-urlencoded');
const Web3 = require('web3');
const bip39 = require('bip39');
const {hdkey} = require('ethereumjs-wallet');
// const blockchain = require('./blockchain.js');
const {getExt, makePromise} = require('./utils.js');
// const browserManager = require('./browser-manager.js');
const config = require('./config.json');
const {accessKeyId, secretAccessKey, /*githubUsername, githubApiKey,*/ githubPagesDomain, githubClientId, githubClientSecret, discordClientId, discordClientSecret, stripeClientId, stripeClientSecret, infuraNetwork, infuraProjectId} = config;
const awsConfig = new AWS.Config({
  credentials: new AWS.Credentials({
    accessKeyId,
    secretAccessKey,
  }),
  region: 'us-west-1',
});
const ddb = new AWS.DynamoDB(awsConfig);
const ddbd = new AWS.DynamoDB.DocumentClient(awsConfig);
const s3 = new AWS.S3(awsConfig);
const ses = new AWS.SES(new AWS.Config({
  credentials: new AWS.Credentials({
    accessKeyId,
    secretAccessKey,
  }),
  region: 'us-west-2',
}));
/* const apiKeyCache = new LRU({
  max: 1024,
  maxAge: 60 * 1000,
}); */
const stripe = Stripe(stripeClientSecret);
// const accountManager = require('./account-manager.js');
// const eventsManager = require('./events-manager.js');
const storageHost = 'https://ipfs.exokit.org';
const ethereumHost = 'ethereum.exokit.org';

const Discord = require('discord.js');

const api = require('./api.js');
// const { _handleStorageRequest } = require('./routes/storage.js');
// const { _handleAccountsRequest } = require('./routes/accounts.js');
// const { _handlePreviewRequest } = require('./routes/preview.js')
const { worldManager, _handleWorldsRequest, _startWorldsRoute } = require('./routes/worlds.js');
const { _handleSignRequest } = require('./routes/sign.js');
const { _handleAnalyticsRequest } = require('./routes/analytics.js');

const CERT = fs.readFileSync('./certs/fullchain.pem');
const PRIVKEY = fs.readFileSync('./certs/privkey.pem');

const PORT = parseInt(process.env.PORT, 10) || 80;
// const filterTopic = 'webxr-site';
const tableName = 'users';

const defaultAvatarPreview = `https://preview.exokit.org/[https://raw.githubusercontent.com/avaer/vrm-samples/master/vroid/male.vrm]/preview.png`;

let web3, addresses, abis, contracts, gethNodeUrl;

Error.stackTraceLimit = 300;

const emailRegex = /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/;
const codeTestRegex = /^[0-9]{6}$/;
const discordIdTestRegex = /^[0-9]+$/;
const twitterIdTestRegex = /^@?(\w){1,15}$/;

function _randomString() {
  return Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 5);
}
function _jsonParse(s) {
  try {
    return JSON.parse(s);
  } catch(err) {
    return null;
  }
}

(async () => {

await worldManager.waitForLoad();

/* const ipfsRepoLockPath = path.join(os.homedir(), '.ipfs', 'repo.lock');
try {
  fs.unlinkSync(ipfsRepoLockPath);
} catch (err) {
  if (err.code === 'ENOENT') {
    // nothing
  } else {
    console.warn(err.stack);
  }
}
const ipfsProcess = child_process.spawn('ipfs', [
  'daemon',
  '--writable',
]);
ipfsProcess.stdout.pipe(process.stdout);
ipfsProcess.stderr.pipe(process.stderr);
ipfsProcess.on('exit', code => {
  console.warn('ipfs exited', code);
});
process.on('exit', () => {
  ipfsProcess.kill(9);
}); */

const _handleLogin = async (req, res) => {
  const _respond = (statusCode, body) => {
    res.statusCode = statusCode;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(body);
  };
  const _setCorsHeaders = res => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
  };

try {
    const {method} = req;
    const {query, pathname: p} = url.parse(req.url, true);

    console.log('got login', {method, p, query});

    if (method === 'POST') {
      let {email, code, token, discordcode, discordid, twittercode, twitterid, autoip, mnemonic} = query;
      if (email && emailRegex.test(email)) {
        if (token) {
          const tokenItem = await ddb.getItem({
            TableName: tableName,
            Key: {
              email: {S: email + '.token'},
            },
          }).promise();
          
          console.log('got login', tokenItem, {email, token});

          const tokens = tokenItem.Item ? JSON.parse(tokenItem.Item.tokens.S) : [];
          if (tokens.includes(token)) {
            _respond(200, JSON.stringify({
              email,
              token,
              name: tokenItem.Item.name.S,
              mnemonic: tokenItem.Item.mnemonic.S,
              addr: tokenItem.Item.addr.S,
              state: tokenItem.Item.state.S,
              stripeState: (tokenItem.Item.stripeState && tokenItem.Item.stripeState.S) ? !!JSON.parse(tokenItem.Item.stripeState.S) : false,
              stripeConnectState: (tokenItem.Item.stripeConnectState && tokenItem.Item.stripeConnectState.S) ? !!JSON.parse(tokenItem.Item.stripeConnectState.S) : false,
              githubOauthState: (tokenItem.Item.githubOauthState && tokenItem.Item.githubOauthState.S) ? !!JSON.parse(tokenItem.Item.githubOauthState.S) : false,
            }));
          } else {
            _respond(401, JSON.stringify({
              error: 'invalid token',
            }));
          }
        } else if (code) {
          if (codeTestRegex.test(code)) {
            const codeItem = await ddb.getItem({
              TableName: tableName,
              Key: {
                email: {S: email + '.code'},
              }
            }).promise();
            
            console.log('got verification', codeItem, {email, code});
            
            if (codeItem.Item && codeItem.Item.code.S === code) {
              await ddb.deleteItem({
                TableName: tableName,
                Key: {
                  email: {S: email + '.code'},
                }
              }).promise();
              
              const tokenItem = await ddb.getItem({
                TableName: tableName,
                Key: {
                  email: {S: email + '.token'},
                },
              }).promise();
              const tokens = (tokenItem.Item && tokenItem.Item.tokens) ? JSON.parse(tokenItem.Item.tokens.S) : [];
              let name = (tokenItem.Item && tokenItem.Item.name) ? tokenItem.Item.name.S : null;
              let mnemonic = (tokenItem.Item && tokenItem.Item.mnemonic) ? tokenItem.Item.mnemonic.S : null;
              let addr = (tokenItem.Item && tokenItem.Item.addr) ? tokenItem.Item.addr.S : null;
              let state = (tokenItem.Item && tokenItem.Item.state) ? tokenItem.Item.state.S : null;
              let stripeState = (tokenItem.Item && tokenItem.Item.stripeState) ? JSON.parse(tokenItem.Item.stripeState.S) : null;
              let stripeConnectState = (tokenItem.Item && tokenItem.Item.stripeConnectState) ? JSON.parse(tokenItem.Item.stripeConnectState.S) : null;
              let githubOauthState = (tokenItem.Item && tokenItem.Item.githubOauthState) ? JSON.parse(tokenItem.Item.githubOauthState.S) : null;
              
              // console.log('old item', tokenItem, {tokens, mnemonic});

              const token = crypto.randomBytes(32).toString('base64');
              tokens.push(token);
              while (tokens.length > 10) {
                tokens.shift();
              }
              if (!name) {
                name = namegen(2).join('-');
              }
              if (!mnemonic || !addr) {
                mnemonic = bip39.generateMnemonic();
                const wallet = hdkey.fromMasterSeed(bip39.mnemonicToSeedSync(mnemonic)).derivePath(`m/44'/60'/0'/0/0`).getWallet();
                addr = wallet.getAddressString();
              }
              if (!state) {
                state = _randomString();
              }
              if (!stripeState) {
                stripeState = null;
              }
              if (!stripeConnectState) {
                stripeConnectState = null;
              }
              if (!githubOauthState) {
                githubOauthState = null;
              }

              // console.log('new item', {name, tokens, mnemonic, addr});
              
              await ddb.putItem({
                TableName: tableName,
                Item: {
                  email: {S: email + '.token'},
                  name: {S: name},
                  tokens: {S: JSON.stringify(tokens)},
                  mnemonic: {S: mnemonic},
                  address: {S: addr},
                  addr: {S: addr},
                  state: {S: state},
                  stripeState: {S: JSON.stringify(stripeState)},
                  stripeConnectState: {S: JSON.stringify(stripeConnectState)},
                  githubOauthState: {S: JSON.stringify(githubOauthState)},
                  // whitelisted: {BOOL: true},
                }
              }).promise();

              _respond(200, JSON.stringify({
                email,
                token,
                name,
                mnemonic,
                addr,
                state,
                stripeState: !!stripeState,
                stripeConnectState: !!stripeConnectState,
                githubOauthState: !!githubOauthState,
              }));
            } else {
              _respond(403, JSON.stringify({
                error: 'invalid code',
              }));
            }
          } else {
            _respond(403, JSON.stringify({
              error: 'invalid code',
            }));
          }
        } else {
          /* const tokenItem = await ddb.getItem({
            TableName: tableName,
            Key: {
              email: {S: email + '.token'},
            }
          }).promise();
          const whitelisted = tokenItem.Item ? tokenItem.Item.whitelisted.BOOL : false;
          console.log('whitelist', {email, whitelisted});

          if (whitelisted) { */
            const code = new Uint32Array(crypto.randomBytes(4).buffer, 0, 1).toString(10).slice(-6);
            
            console.log('verification', {email, code});

            await ddb.putItem({
              TableName: tableName,
              Item: {
                email: {S: email + '.code'},
                code: {S: code},
              }
            }).promise();
            
            var params = {
                Destination: {
                    ToAddresses: [email],
                },
                Message: {
                    Body: {
                        Html: {
                            Data: `<h1>${code}</h1><h2><a href="https://webaverse.com/login.html?email=${encodeURIComponent(email)}&code=${encodeURIComponent(code)}">Log in</a></h2>`
                        }
                    },
                    
                    Subject: {
                        Data: `Verification code for Webaverse`
                    }
                },
                Source: "noreply@exokit.org"
            };
        
            
            const data = await ses.sendEmail(params).promise();
            
            console.log('got response', data);
            
            _respond(200, JSON.stringify({}));
          /* } else {
            _respond(403, JSON.stringify({
              error: 'email not whitelisted',
            }));
          } */
        }
      } else if (discordcode) {
        if (discordIdTestRegex.test(discordid)) {
          const codeItem = await ddb.getItem({
            TableName: tableName,
            Key: {
              email: {S: discordid + '.code'},
            }
          }).promise();
          
          console.log('check item', discordid, JSON.stringify(codeItem.Item, null, 2));
          
          if (codeItem.Item && codeItem.Item.code.S === discordcode) {
            await ddb.deleteItem({
              TableName: tableName,
              Key: {
                email: {S: discordid + '.code'},
              }
            }).promise();

            // generate        
            const tokenItem = await ddb.getItem({
              TableName: tableName,
              Key: {
                email: {S: discordid + '.discordtoken'},
              },
            }).promise();
            const tokens = (tokenItem.Item && tokenItem.Item.tokens) ? JSON.parse(tokenItem.Item.tokens.S) : [];
            let name = (tokenItem.Item && tokenItem.Item.name) ? tokenItem.Item.name.S : null;
            let mnemonic = (tokenItem.Item && tokenItem.Item.mnemonic) ? tokenItem.Item.mnemonic.S : null;
            // let addr = (tokenItem.Item && tokenItem.Item.address) ? tokenItem.Item.address.S : null;
            
            // console.log('old item', tokenItem, {tokens, mnemonic});

            const token = crypto.randomBytes(32).toString('base64');
            tokens.push(token);
            while (tokens.length > 10) {
              tokens.shift();
            }
            if (!name) {
              name = namegen(2).join('-');
            }
            if (!mnemonic) {
              mnemonic = bip39.generateMnemonic();
              /* const wallet = hdkey.fromMasterSeed(bip39.mnemonicToSeedSync(mnemonic)).derivePath(`m/44'/60'/0'/0/0`).getWallet();
              addr = wallet.getAddressString(); */
            }

            await ddb.putItem({
              TableName: tableName,
              Item: {
                email: {S: discordid + '.discordtoken'},
                mnemonic: {S: mnemonic},
                // address: {S: addr},
              }
            }).promise();

            // respond
            _setCorsHeaders(res);
            res.end(JSON.stringify({mnemonic}));
          } else {
            _respond(403, JSON.stringify({
              error: 'invalid code',
            }));
          }
        } else {
          const proxyReq = await https.request({
            method: 'POST',
            host: 'discord.com',
            path: '/api/oauth2/token',
            headers: {
              // Accept: 'application/json',
              'Content-Type': 'application/x-www-form-urlencoded',
              // 'User-Agent': 'exokit-server',
            },
          }, async proxyRes => {
            const discordOauthState = await new Promise((accept, reject) => {
              const bs = [];
              proxyRes.on('data', b => {
                bs.push(b);
              });
              proxyRes.on('end', () => {
                accept(JSON.parse(Buffer.concat(bs).toString('utf8')));
              });
              proxyRes.on('error', err => {
                reject(err);
              });
            });
            const {access_token} = discordOauthState;
            
            const proxyReq2 = await https.request({
              host: 'discord.com',
              path: '/api/users/@me',
              headers: {
                Authorization: `Bearer ${access_token}`,
              },
            }, async proxyRes2 => {
              const j = await new Promise((accept, reject) => {
                const bs = [];
                proxyRes2.on('data', b => {
                  bs.push(b);
                });
                proxyRes2.on('end', () => {
                  accept(JSON.parse(Buffer.concat(bs).toString('utf8')));
                });
                proxyRes2.on('error', err => {
                  reject(err);
                });
              });
              const {id} = j;

              if (id) {
                const _getUser = async id => {
                  const tokenItem = await ddb.getItem({
                    TableName: tableName,
                    Key: {
                      email: {S: id + '.discordtoken'},
                    }
                  }).promise();

                  let mnemonic = (tokenItem.Item && tokenItem.Item.mnemonic) ? tokenItem.Item.mnemonic.S : null;
                  return {mnemonic};
                };
                const _genKey = async id => {
                  const mnemonic = bip39.generateMnemonic();
                  const wallet = hdkey.fromMasterSeed(bip39.mnemonicToSeedSync(mnemonic)).derivePath(`m/44'/60'/0'/0/0`).getWallet();
                  const address = wallet.getAddressString();

                  await ddb.putItem({
                    TableName: tableName,
                    Item: {
                      email: {S: id + '.discordtoken'},
                      mnemonic: {S: mnemonic},
                      address: {S: address},
                    }
                  }).promise();
                  return {mnemonic};
                };
                
                const user = await _getUser(id) || _genKey(id);
                const {mnemonic} = user;

                _setCorsHeaders(res);
                res.end(JSON.stringify({mnemonic}));
              } else {
                console.warn('discord oauth failed', j);
                _respond(403, JSON.stringify({
                  error: 'discord oauth failed',
                }));
              }
            });
            proxyReq2.end();
            proxyReq2.on('error', err => {
              _respond(500, JSON.stringify({
                error: err.stack,
              }));
            });
          });
          const s = formurlencoded({
            client_id: discordClientId,
            client_secret: discordClientSecret,
            code: discordcode,
            grant_type: 'authorization_code',
            scope: 'identify',
            redirect_uri: 'https://webaverse.com/login',
          });
          proxyReq.end(s);
          proxyReq.on('error', err => {
            _respond(500, JSON.stringify({
              error: err.stack,
            }));
          });
        }
      } else if (twittercode) {
        if (twitterIdTestRegex.test(twitterid)) {
          const codeItem = await ddb.getItem({
            TableName: tableName,
            Key: {
              email: {S: twitterid + '.code'},
            }
          }).promise();
          
          console.log('check item', twitterid, JSON.stringify(codeItem.Item, null, 2));
          
          if (codeItem.Item && codeItem.Item.code.S === twittercode) {
            await ddb.deleteItem({
              TableName: tableName,
              Key: {
                email: {S: twitterid + '.code'},
              }
            }).promise();

            // generate        
            const tokenItem = await ddb.getItem({
              TableName: tableName,
              Key: {
                email: {S: twitterid + '.twittertoken'},
              },
            }).promise();
            const tokens = (tokenItem.Item && tokenItem.Item.tokens) ? JSON.parse(tokenItem.Item.tokens.S) : [];
            let name = (tokenItem.Item && tokenItem.Item.name) ? tokenItem.Item.name.S : null;
            let mnemonic = (tokenItem.Item && tokenItem.Item.mnemonic) ? tokenItem.Item.mnemonic.S : null;
            // let addr = (tokenItem.Item && tokenItem.Item.address) ? tokenItem.Item.address.S : null;
            
            // console.log('old item', tokenItem, {tokens, mnemonic});

            const token = crypto.randomBytes(32).toString('base64');
            tokens.push(token);
            while (tokens.length > 10) {
              tokens.shift();
            }
            if (!name) {
              name = namegen(2).join('-');
            }
            if (!mnemonic) {
              mnemonic = bip39.generateMnemonic();
              /* const wallet = hdkey.fromMasterSeed(bip39.mnemonicToSeedSync(mnemonic)).derivePath(`m/44'/60'/0'/0/0`).getWallet();
              addr = wallet.getAddressString(); */
            }

            await ddb.putItem({
              TableName: tableName,
              Item: {
                email: {S: twitterid + '.twittertoken'},
                mnemonic: {S: mnemonic},
                // address: {S: addr},
              }
            }).promise();

            // respond
            _setCorsHeaders(res);
            res.end(JSON.stringify({mnemonic}));
          } else {
            _respond(403, JSON.stringify({
              error: 'Invalid code',
            }));
          }
        } else {
          _respond(403, JSON.stringify({
            error: 'Invalid Twitter ID',
          }));
        }
      } else if (autoip) {
        const ip = req.connection.remoteAddress;
        if (autoip === 'src' && mnemonic) {
          console.log('got remote address src', ip);
          
          await ddb.putItem({
            TableName: tableName,
            Item: {
              email: {S: ip + '.ipcode'},
              mnemonic: {S: mnemonic},
              timeout: {N: (Date.now() + 60*1000) + ''},
            }
          }).promise();

          _respond(200, JSON.stringify({
            ip,
          }));
        } else if (autoip === 'dst') {
          console.log('got remote address dst', ip);
          
          const codeItem = await ddb.getItem({
            TableName: tableName,
            Key: {
              email: {S: ip + '.ipcode'},
            }
          }).promise();
          
          console.log('check item', ip, JSON.stringify(codeItem.Item, null, 2));
          
          if (codeItem.Item && codeItem.Item.mnemonic.S && Date.now() < +new Date(parseInt(codeItem.Item.timeout.N))) {
            await ddb.deleteItem({
              TableName: tableName,
              Key: {
                email: {S: ip + '.ipcode'},
              }
            }).promise();

            const mnemonic = codeItem.Item.mnemonic.S;

            _setCorsHeaders(res);
            res.end(JSON.stringify({mnemonic}));
          } else {
            _respond(400, JSON.stringify({
              error: 'invalid autoip src',
            }));
          }
        } else {
          _respond(400, JSON.stringify({
            error: 'invalid autoip parameters',
          }));
        }
      } else {
        _respond(400, JSON.stringify({
          error: 'invalid parameters',
        }));
      }
    } else {
      _respond(400, JSON.stringify({
        error: 'invalid method',
      }));
    }
} catch(err) {
  console.warn(err);

  _respond(500, JSON.stringify({
    error: err.stack,
  }));
}
};

/* const MAX_SIZE = 50 * 1024 * 1024;
const _handleIpfs = async (req, res) => {
  const _respond = (statusCode, body) => {
    res.statusCode = statusCode;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(body);
  };
  const _setCorsHeaders = res => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
  };

try {
    const {method} = req;
    const {query, pathname: p} = url.parse(req.url, true);

    // console.log('got ethereum', {method, p, query});

    if (method === 'GET') {
      const match = req.url.match(/^(?:\/ipfs)?\/([a-z0-9]+)(?:\/(.*))?$/i);
      if (match) {
        const proxy = httpProxy.createProxyServer({});
        req.url = '/ipfs/' + match[1];
        proxy
          .web(req, res, {
            target: 'http://127.0.0.1:8080',
            // secure: false,
            changeOrigin: true,
          }, err => {
            console.warn(err.stack);

            res.statusCode = 500;
            res.end();
          });
      } else {
        res.statusCode = 404;
        res.end();
      }
    } else if (method === 'POST') {
      const form = new FormData();
      form.append('file', req);
      form.submit('http://127.0.0.1:5001/api/v0/add', function(err, proxyRes) {
        if (!err) {
          if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
            const bs = [];
            proxyRes.on('data', function(d) {
              bs.push(d);
            });
            proxyRes.on('end', function() {
              const b = Buffer.concat(bs);
              const s = b.toString('utf8');
              const j = JSON.parse(s);
              const {Hash} = j;
              res.end(Hash);
            });
          } else {
            res.statusCode = proxyRes.statusCode;
            proxyRes.pipe(res);
          }
        } else {
          res.statusCode = 500;
          res.end(err.stack);
        }
      });
    } else {
      _respond(500, JSON.stringify({
        error: err.stack,
      }));
    }
} catch(err) {
  console.warn(err);

  _respond(500, JSON.stringify({
    error: err.stack,
  }));
}
}; */

const _handleEthereum = port => async (req, res) => { // XXX make this per-port
  const _respond = (statusCode, body) => {
    res.statusCode = statusCode;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(body);
  };
  const _setCorsHeaders = res => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
  };

try {
    const {method} = req;
    const {query, pathname: p} = url.parse(req.url, true);

    // console.log('got ethereum', {method, p, query});

    const proxy = httpProxy.createProxyServer({});
    proxy
      .web(req, res, {
        target: gethNodeUrl + ':' + port,
        // secure: false,
        changeOrigin: true,
      }, err => {
        console.warn(err.stack);

        res.statusCode = 500;
        res.end();
      });
} catch(err) {
  console.warn(err);

  _respond(500, JSON.stringify({
    error: err.stack,
  }));
}
};

const _handleAccounts = isMainChain => async (req, res) => {
  const chainName = isMainChain ? 'mainnetsidechain' : 'rinkebysidechain';
  const _respond = (statusCode, body) => {
    res.statusCode = statusCode;
    _setCorsHeaders(res);
    res.end(body);
  };
  const _setCorsHeaders = res => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
  };
  const _getAccount = async address => {
    const result = {
      address,
    };
    await Promise.all(
      [
        'name',
        'avatarId',
        'avatarName',
        'avatarExt',
        'avatarPreview',
        'loadout',
        'homeSpaceId',
        'homeSpaceName',
        'homeSpaceExt',
        'homeSpacePreview',
        'ftu',
        'mainnetAddress',
      ].map(key =>
        contracts[chainName].Account.methods.getMetadata(address, key).call()
          .then(value => {
            result[key] = value;
          })
      )
    );
    return result;
  };

try {
  const {method} = req;
  let {pathname: p} = url.parse(req.url);
  // console.log('ipfs request', {method, p});

  if (method === 'OPTIONS') {
    // res.statusCode = 200;
    _setCorsHeaders(res);
    res.end();
  } else if (method === 'GET') {
    if (p === '/') {
      const addressMap = {};
      await Promise.all([
        contracts[chainName].NFT.getPastEvents('Transfer', {
          fromBlock: 0,
          toBlock: 'latest',
        }).then(entries => {
          for (const entry of entries) {
            const address = entry.returnValues.to;
            addressMap[address] = true;
          }
        }),
        contracts[chainName].FT.getPastEvents('Transfer', {
          fromBlock: 0,
          toBlock: 'latest',
        }).then(entries => {
          for (const entry of entries) {
            const address = entry.returnValues.to;
            addressMap[address] = true;
          }
        }),
      ]);
      const addresses = Object.keys(addressMap);
      const accounts = await Promise.all(addresses.map(address => _getAccount(address)));
      _respond(200, JSON.stringify(accounts));
    } else {
      const match = p.match(/^\/(0x[a-f0-9]+)$/i);
      if (match) {
        const address = match[1];
        const result = await _getAccount(address);
        _respond(200, JSON.stringify(result));
      } else {
        _respond(404, '');
      }
    }
  } else {
    _respond(404, '');
  }
} catch(err) {
  console.warn(err);

  _respond(500, JSON.stringify({
    error: err.stack,
  }));
}
};

/* const _handlePayments = async (req, res) => {
  const _respond = (statusCode, body) => {
    res.statusCode = statusCode;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
    res.end(body);
  };

try {
  // console.log('got payments req', req.url, req.headers);

  const o = url.parse(req.url, true);
  if (o.pathname === '/card') {
    let {email, token, number, exp_month, exp_year, cvc} = o.query;
    exp_month = parseInt(exp_month, 10);
    exp_year = parseInt(exp_year, 10);
    const tokenItem = await ddb.getItem({
      TableName: tableName,
      Key: {
        email: {S: email + '.token'},
      }
    }).promise();

    // console.log('got item', JSON.stringify(token), tokenItem && tokenItem.Item);

    const tokens = tokenItem.Item ? JSON.parse(tokenItem.Item.tokens.S) : [];
    if (tokens.includes(token)) {
      const stripeState = await stripe.tokens.create({
        card: {
          number,
          exp_month,
          exp_year,
          cvc,
        }
      });

      await ddb.putItem({
        TableName: tableName,
        Item: {
          email: {S: tokenItem.Item.email.S},
          name: {S: tokenItem.Item.name.S},
          tokens: {S: tokenItem.Item.tokens.S},
          // mnemonic: {S: tokenItem.Item.mnemonic.S},
          // addr: {S: tokenItem.Item.addr.S},
          state: {S: tokenItem.Item.state.S},
          stripeState: {S: JSON.stringify(stripeState)},
          stripeConnectState: {S: tokenItem.Item.stripeConnectState.S},
          githubOauthState: {S: tokenItem.Item.githubOauthState.S},
          // whitelisted: {BOOL: tokenItem.Item.whitelisted.BOOL},
        }
      }).promise();

      _respond(200, JSON.stringify({
        email,
        token,
        name: tokenItem.Item.name.S,
        // mnemonic: tokenItem.Item.mnemonic.S,
        // addr: tokenItem.Item.addr.S,
        state: tokenItem.Item.state.S,
        stripeState: !!stripeState,
        stripeConnectState: !!JSON.parse(tokenItem.Item.stripeConnectState.S),
        githubOauthState: !!JSON.parse(tokenItem.Item.githubOauthState.S),
      }));
    } else {
      _respond(401, 'not authorized');
    }
  } else if (o.pathname === '/uncard') {
    let {email, token, number, exp_month, exp_year, cvc} = o.query;
    const tokenItem = await ddb.getItem({
      TableName: tableName,
      Key: {
        email: {S: email + '.token'},
      }
    }).promise();

    // console.log('got item', JSON.stringify(token), tokenItem && tokenItem.Item);

    const tokens = tokenItem.Item ? JSON.parse(tokenItem.Item.tokens.S) : [];
    if (tokens.includes(token)) {
      const stripeState = null;
      await ddb.putItem({
        TableName: tableName,
        Item: {
          email: {S: tokenItem.Item.email.S},
          name: {S: tokenItem.Item.name.S},
          tokens: {S: tokenItem.Item.tokens.S},
          // mnemonic: {S: tokenItem.Item.mnemonic.S},
          // addr: {S: tokenItem.Item.addr.S},
          state: {S: tokenItem.Item.state.S},
          stripeState: {S: JSON.stringify(stripeState)},
          stripeConnectState: {S: tokenItem.Item.stripeConnectState.S},
          githubOauthState: {S: tokenItem.Item.githubOauthState.S},
          // whitelisted: {BOOL: tokenItem.Item.whitelisted.BOOL},
        }
      }).promise();

      _respond(200, JSON.stringify({
        email,
        token,
        name: tokenItem.Item.name.S,
        // mnemonic: tokenItem.Item.mnemonic.S,
        // addr: tokenItem.Item.addr.S,
        state: tokenItem.Item.state.S,
        stripeState: !!stripeState,
        stripeConnectState: !!JSON.parse(tokenItem.Item.stripeConnectState.S),
        githubOauthState: !!JSON.parse(tokenItem.Item.githubOauthState.S),
      }));
    } else {
      _respond(401, 'not authorized');
    }
  } else if (o.pathname === '/authorize' && o.query.email && o.query.token) {
    let {email, token, redirectUrl} = o.query;
    const tokenItem = await ddb.getItem({
      TableName: tableName,
      Key: {
        email: {S: email + '.token'},
      }
    }).promise();

    const tokens = tokenItem.Item ? JSON.parse(tokenItem.Item.tokens.S) : [];
    if (tokens.includes(token)) {
      const state = email + ':' + tokenItem.Item.state.S + ':' + redirectUrl;

      let parameters = {
        client_id,
        state,
      };
      parameters = Object.assign(parameters, { // XXX
        'stripe_user[business_type]': 'individual',
        'stripe_user[business_name]': 'Exokit Lol',
        'stripe_user[first_name]': 'A',
        'stripe_user[last_name]': 'B',
        'stripe_user[email]': 'lol@lol.com',
      });

      res.statusCode = 301;
      res.setHeader('Location', 'https://connect.stripe.com/express/oauth/authorize?' + querystring.stringify(parameters));
      res.end();
    } else {
      _respond(401, 'not authorized');
    }
  } else if (o.pathname === '/token') {
    // console.log('got query', o.query);

    const proxyRes = await request.post({
      uri: 'https://connect.stripe.com/oauth/token',
      form: { 
        grant_type: 'authorization_code',
        client_id,
        client_secret,
        code: o.query.code,
      },
      json: true
    });

    const stripeConnectState = await new Promise((accept, reject) => {
      const bs = [];
      proxyRes.on('data', b => {
        bs.push(b);
      });
      proxyRes.on('end', () => {
        accept(JSON.parse(Buffer.concat(bs).toString('utf8')));
      });
      proxyRes.on('error', err => {
        reject(err);
      });
    });
    
    // console.log('got json 2', stripeConnectState);

    const match = o.query.state.match(/^([^:]+):([^:]+):(.+)$/);
    if (match) {
      const queryEmail = match[1];
      const queryState = match[2];
      const queryUrl = match[3];

      const tokenItem = await ddb.getItem({
        TableName: tableName,
        Key: {
          email: {S: queryEmail + '.token'},
        }
      }).promise();
      const dbState = tokenItem.Item ? tokenItem.Item.state.S : null;
      // console.log('logging in', queryEmail, queryState, queryUrl, dbState, tokenItem.Item);

      if (dbState === queryState) {
        await ddb.putItem({
          TableName: tableName,
          Item: {
            email: {S: tokenItem.Item.email.S},
            name: {S: tokenItem.Item.name.S},
            tokens: {S: tokenItem.Item.tokens.S},
            // mnemonic: {S: tokenItem.Item.mnemonic.S},
            // addr: {S: tokenItem.Item.addr.S},
            state: {S: tokenItem.Item.state.S},
            stripeState: {S: tokenItem.Item.stripeState.S},
            stripeConnectState: {S: JSON.stringify(stripeConnectState)},
            githubOauthState: {S: tokenItem.Item.githubOauthState.S},
            // whitelisted: {BOOL: tokenItem.Item.whitelisted.BOOL},
          }
        }).promise();

        res.statusCode = 301;
        res.setHeader('Location', queryUrl);
        res.end();
      } else {
        _respond(400, 'not authorized');
      }
    } else {
      _respond(400, 'invalid parameters');
    }
  } else if (o.pathname === '/untoken' && o.query.email && o.query.token) {
    const {email, token} = o.query;
    const tokenItem = await ddb.getItem({
      TableName: tableName,
      Key: {
        email: {S: email + '.token'},
      }
    }).promise();

    const tokens = tokenItem.Item ? JSON.parse(tokenItem.Item.tokens.S) : [];
    if (tokens.includes(token)) {
      await ddb.putItem({
        TableName: tableName,
        Item: {
          email: {S: tokenItem.Item.email.S},
          name: {S: tokenItem.Item.name.S},
          tokens: {S: tokenItem.Item.tokens.S},
          // mnemonic: {S: tokenItem.Item.mnemonic.S},
          // addr: {S: tokenItem.Item.addr.S},
          state: {S: tokenItem.Item.state.S},
          stripeState: {S: tokenItem.Item.stripeState.S},
          stripeConnectState: {S: JSON.stringify(null)},
          githubOauthState: {S: tokenItem.Item.githubOauthState.S},
          // whitelisted: {BOOL: tokenItem.Item.whitelisted.BOOL},
        }
      }).promise();

      _respond(200, 'ok');
    } else {
      _respond(401, 'not authorized');
    }
  } else {
    _respond(404, 'not found');
  }
} catch (err) {
  console.warn(err.stack);
}
}; */

const _handleOauth = async (req, res) => {
  const _respond = (statusCode, body) => {
    res.statusCode = statusCode;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
    res.end(body);
  };

try {
  // console.log('got payments req', req.url, req.headers);

  const {method} = req;
  const o = url.parse(req.url, true);
  if (method === 'GET' && o.pathname === '/github') {
    const {state, code} = o.query;
    console.log('handle github oauth', {state, code});
    const match = state ? state.match(/^(.+?):(.+?):(.+?)$/) : null;
    if (match && code) {
      const email = match[1];
      const token = match[2];
      const redirect = match[3];

      const tokenItem = await ddb.getItem({
        TableName: tableName,
        Key: {
          email: {S: email + '.token'},
        }
      }).promise();

      // console.log('got item', JSON.stringify(token), tokenItem && tokenItem.Item);

      const tokens = tokenItem.Item ? JSON.parse(tokenItem.Item.tokens.S) : [];
      if (tokens.includes(token)) {
        console.log('github oauth ok', tokenItem.Item);

        const proxyReq = await https.request({
          method: 'POST',
          host: 'github.com',
          path: '/login/oauth/access_token',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            // 'User-Agent': 'exokit-server',
          },
        }, async proxyRes => {
          const githubOauthState = await new Promise((accept, reject) => {
            const bs = [];
            proxyRes.on('data', b => {
              bs.push(b);
            });
            proxyRes.on('end', () => {
              accept(JSON.parse(Buffer.concat(bs).toString('utf8')));
            });
            proxyRes.on('error', err => {
              reject(err);
            });
          });

          await ddb.putItem({
            TableName: tableName,
            Item: {
              email: {S: tokenItem.Item.email.S},
              name: {S: tokenItem.Item.name.S},
              tokens: {S: tokenItem.Item.tokens.S},
              // mnemonic: {S: tokenItem.Item.mnemonic.S},
              // addr: {S: tokenItem.Item.addr.S},
              state: {S: tokenItem.Item.state.S},
              stripeState: {S: tokenItem.Item.stripeState.S},
              stripeConnectState: {S: tokenItem.Item.stripeConnectState.S},
              githubOauthState: {S: JSON.stringify(githubOauthState)},
              // whitelisted: {BOOL: tokenItem.Item.whitelisted.BOOL},
            }
          }).promise();

          res.statusCode = 301;
          res.setHeader('Location', redirect);
          res.end();
        });
        proxyReq.on('error', err => {
          _respond(500, err.stack);
        });
        proxyReq.end(JSON.stringify({
          client_id: githubClientId,
          client_secret: githubClientSecret,
          code,
          state,
        }));
      } else {
        _respond(401, 'not authorized');
      }
    } else {
      _respond(400, 'invalid parameters');
    }
  } else {
    _respond(404, 'not found');
  }
} catch (err) {
  console.warn(err.stack);
}
};

const _handleProfile = isMainChain => async (req, res) => {
  const chainName = isMainChain ? 'mainnetsidechain' : 'rinkebysidechain';
  const _respond = (statusCode, body) => {
    res.statusCode = statusCode;
    _setCorsHeaders(res);
    res.end(body);
  };
  const _setCorsHeaders = res => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
  };

try {
  const {method} = req;

  if (method === 'GET') {
    const {pathname: p} = url.parse(req.url, true);
    // console.log('got p', p);
    let match;
    if (match = p.match(/^\/(0x[a-f0-9]+)$/)) {
      const address = match[1];

      const tokenIds = await contracts[chainName].NFT.methods.getTokenIdsOf(address).call();

      let username = await contracts[chainName].Account.methods.getMetadata(address, 'name').call();
      if (!username) {
        username = 'Anonymous';
      }
      let avatarPreview = await contracts[chainName].Account.methods.getMetadata(address, 'avatarPreview').call();
      if (!avatarPreview) {
        avatarPreview = defaultAvatarPreview;
      }
      const balance = await contracts[chainName].FT.methods.balanceOf(address).call();

      const storeEntries = await _getStoreEntries(isMainChain);
      const tokens = await Promise.all(tokenIds.map(tokenId => _getChainToken(isMainChain, false)(tokenId, storeEntries)));

      const tokens2 = [];
      for (const token of tokens) {
        // if (token) {
          if (!tokens2.some(token2 => token2.properties.hash === token.properties.hash)) {
            tokens2.push(token);
          }
        // }
      }

      const result = {
        username,
        avatarPreview,
        homeSpacePreview: `https://desktopography.net/wp-content/uploads/bfi_thumb/desk_ranko_blazina-34qm8ho3dk1rd512mo5pfk.jpg`,
        balance,
        tokens: tokens2,
        loadout: tokens2.length > 0 ? tokens.slice(0, 1) : [],
      };
      _setCorsHeaders(res);
      res.setHeader('Content-Type', 'application/json');
      _respond(200, JSON.stringify(result));
    } else {
      _respond(404, 'not found');
    }
  } else {
    _respond(404, 'not found');
  }
} catch(err) {
  console.warn(err);

  _respond(500, JSON.stringify({
    error: err.stack,
  }));
}
};

const _handleProxyRoot = (() => {
  const proxy = httpProxy.createProxyServer({});
  /* proxy.on('proxyRes', (proxyRes, req) => {
    if (proxyRes.headers['location']) {
      const o = new url.URL(proxyRes.headers['location'], req.url);
      // console.log('redirect location 1', req.url, proxyRes.headers['location'], o.href);
      o.host = o.host.replace('-', '--');
      o.host = o.protocol.slice(0, -1) + '-' + o.host.replace(/\./g, '-').replace(/:([0-9]+)$/, '-$1') + '.proxy.exokit.org';
      o.protocol = 'https:';
      proxyRes.headers['location'] = o.href;
    }
    proxyRes.headers['access-control-allow-origin'] = '*';
  }); */
  proxy.on('error', err => {
    console.warn(err.stack);
  });
  return (req, res) => {
    proxy.web(req, res, {
      target: 'https://webaverse.com',
      // secure: false,
      changeOrigin: true,
    }, err => {
      console.warn(err.stack);

      res.statusCode = 500;
      res.end();
    });
  };
})();

const _handleProxyApp = (() => {
  const proxy = httpProxy.createProxyServer({});
  /* proxy.on('proxyRes', (proxyRes, req) => {
    if (proxyRes.headers['location']) {
      const o = new url.URL(proxyRes.headers['location'], req.url);
      // console.log('redirect location 1', req.url, proxyRes.headers['location'], o.href);
      o.host = o.host.replace('-', '--');
      o.host = o.protocol.slice(0, -1) + '-' + o.host.replace(/\./g, '-').replace(/:([0-9]+)$/, '-$1') + '.proxy.exokit.org';
      o.protocol = 'https:';
      proxyRes.headers['location'] = o.href;
    }
    proxyRes.headers['access-control-allow-origin'] = '*';
  }); */
  proxy.on('error', err => {
    console.warn(err.stack);
  });
  return (req, res) => {
    proxy.web(req, res, {
      target: 'https://app.webaverse.com',
      // secure: false,
      changeOrigin: true,
    }, err => {
      console.warn(err.stack);

      res.statusCode = 500;
      res.end();
    });
  };
})();

const _formatToken = isMainChain => async (token, storeEntries, mainnetToken) => {
  const chainName = isMainChain ? 'mainnetsidechain' : 'rinkebysidechain';
  const _fetchAccount = async address => {
    const [
      username,
      avatarPreview,
      monetizationPointer,
    ] = await Promise.all([
      (async () => {
        let username = await contracts[chainName].Account.methods.getMetadata(address, 'name').call();
        if (!username) {
          username = 'Anonymous';
        }
        return username;
      })(),
      (async () => {
        let avatarPreview = await contracts[chainName].Account.methods.getMetadata(address, 'avatarPreview').call();
        if (!avatarPreview) {
          avatarPreview = defaultAvatarPreview;
        }
        return avatarPreview;
      })(),
      (async () => {
        let monetizationPointer = await contracts[chainName].Account.methods.getMetadata(address, 'monetizationPointer').call();
        if (!monetizationPointer) {
          monetizationPointer = '';
        }
        return monetizationPointer;
      })(),
    ]);

    return {
      address,
      username,
      avatarPreview,
      monetizationPointer,
    };
  };
  let [minter, owner] = await Promise.all([
    _fetchAccount(token.minter),
    _fetchAccount(token.owner),
  ]);

  let isMainnet = false; 
  if (mainnetToken && owner.address === addresses[chainName]['NFTProxy'] && mainnetToken.owner !== "0x0000000000000000000000000000000000000000") {
    isMainnet = true;
    owner.address = mainnetToken.owner;
  }

  const id = parseInt(token.id, 10);
  const {name, ext, hash} = token;
  const description = await contracts[chainName].NFT.methods.getMetadata(hash, 'description').call();
  const storeEntry = storeEntries.find(entry => entry.tokenId === id);
  const buyPrice = storeEntry ? storeEntry.price : null;
  const storeId = storeEntry ? storeEntry.id : null;
  return {
    id,
    name,
    description,
    image: 'https://preview.exokit.org/' + hash + '.' + ext + '/preview.png',
    external_url: 'https://app.webaverse.com?h=' + hash,
    animation_url: `${storageHost}/${hash}/preview.${ext === 'vrm' ? 'glb' : ext}`,
    properties: {
      name,
      hash,
      ext,
    },
    minter,
    owner,
    balance: parseInt(token.balance, 10),
    totalSupply: parseInt(token.totalSupply, 10),
    buyPrice,
    storeId,
    isMainnet,
  };
};
const _formatLand = isMainChain => async (token, storeEntries) => {
  const chainName = isMainChain ? 'mainnetsidechain' : 'rinkebysidechain';
  const _fetchAccount = async address => {
    const [
      username,
      avatarPreview,
      monetizationPointer,
    ] = await Promise.all([
      (async () => {
        let username = await contracts[chainName].Account.methods.getMetadata(address, 'name').call();
        if (!username) {
          username = 'Anonymous';
        }
        return username;
      })(),
      (async () => {
        let avatarPreview = await contracts[chainName].Account.methods.getMetadata(address, 'avatarPreview').call();
        if (!avatarPreview) {
          avatarPreview = defaultAvatarPreview;
        }
        return avatarPreview;
      })(),
      (async () => {
        let monetizationPointer = await contracts[chainName].Account.methods.getMetadata(address, 'monetizationPointer').call();
        if (!monetizationPointer) {
          monetizationPointer = '';
        }
        return monetizationPointer;
      })(),
    ]);

    return {
      address,
      username,
      avatarPreview,
      monetizationPointer,
    };
  };
  const owner = await _fetchAccount(token.owner);

  const id = parseInt(token.id, 10);
  // console.log('got token', token);
  const {name, hash, ext} = token;
  const [
    description,
    rarity,
    extents,
  ] = await Promise.all([
    contracts[chainName].LAND.methods.getSingleMetadata(id, 'description').call(),
    contracts[chainName].LAND.methods.getMetadata(name, 'rarity').call(),
    contracts[chainName].LAND.methods.getMetadata(name, 'extents').call(),
  ]);
  const extentsJson = _jsonParse(extents);
  const coord = (
    extentsJson && extentsJson[0] &&
    typeof extentsJson[0][0] === 'number' && typeof extentsJson[0][1] === 'number' && typeof extentsJson[0][2] === 'number' &&
    typeof extentsJson[1][0] === 'number' && typeof extentsJson[1][1] === 'number' && typeof extentsJson[1][2] === 'number'
  ) ? [
    (extentsJson[1][0] + extentsJson[0][0])/2,
    (extentsJson[1][1] + extentsJson[0][1])/2,
    (extentsJson[1][2] + extentsJson[0][2])/2,
  ] : null;
  return {
    id,
    name,
    description,
    image: coord ? `https://land-preview.exokit.org/32/${coord[0]}/${coord[2]}?${extentsJson ? `e=${JSON.stringify(extentsJson)}` : ''}` : null,
    external_url: `https://app.webaverse.com?${coord ? `c=${JSON.stringify(coord)}` : ''}`,
    // animation_url: `${storageHost}/${hash}/preview.${ext === 'vrm' ? 'glb' : ext}`,
    properties: {
      name,
      hash,
      rarity,
      extents,
      ext,
    },
    owner,
    balance: parseInt(token.balance, 10),
    totalSupply: parseInt(token.totalSupply, 10)
  };
};
const _getChainNft = contractName => (isMainChain, isFront) => async (tokenId, storeEntries) => {
  const chainName = (isMainChain ? 'mainnet' : 'rinkeby') + (isFront ? '' : 'sidechain');
  const token = await contracts[chainName][contractName].methods.tokenByIdFull(tokenId).call();
  let mainnetToken;
  if (!isFront) {
    mainnetToken = await contracts[isMainChain ? 'mainnet' : 'rinkeby'][contractName].methods.tokenByIdFull(tokenId).call();
  }
  if (contractName === 'NFT') {
    return await _formatToken(isMainChain)(token, storeEntries, mainnetToken);
  } else if (contractName === 'LAND') {
    return await _formatLand(isMainChain)(token, storeEntries, mainnetToken);
  } else {
    return null;
  }
};
const _getChainToken = _getChainNft('NFT');
const _getChainLand = _getChainNft('LAND');
const _getChainOwnerNft = contractName => (isMainChain, isFront) => async (address, i, storeEntries) => {
  const chainName = (isMainChain ? 'mainnet' : 'rinkeby') + (isFront ? '' : 'sidechain');
  const token = await contracts[chainName][contractName].methods.tokenOfOwnerByIndexFull(address, i).call();
  console.log("got token", token.id);
  let mainnetToken;
  if (!isFront) {
    mainnetToken = await contracts[isMainChain ? 'mainnet' : 'rinkeby'][contractName].methods.tokenByIdFull(token.id).call();
  }
  if (contractName === 'NFT') {
    return await _formatToken(isMainChain)(token, storeEntries, mainnetToken);
  } else if (contractName === 'LAND') {
    return await _formatLand(isMainChain)(token, storeEntries, mainnetToken);
  } else {
    return null;
  }
};
const _getStoreEntries = async isMainChain => {
  const chainName = isMainChain ? 'mainnetsidechain' : 'rinkebysidechain';
  const numStores = await contracts[chainName].Trade.methods.numStores().call();
  const promises = Array(numStores);
  for (let i = 0; i < numStores; i++) {
    promises[i] = contracts[chainName].Trade.methods.getStoreByIndex(i + 1).call()
      .then(store => {
        if (store.live) {
          const id = parseInt(store.id, 10);
          const seller = store.seller.toLowerCase();
          const tokenId = parseInt(store.tokenId, 10);
          const price = parseInt(store.price, 10);
          const entry = {
            id,
            seller,
            tokenId,
            price,
          };
          return entry;
        } else {
          return null;
        }
      });
  }
  let storeEntries = await Promise.all(promises);
  storeEntries = storeEntries.filter(store => store !== null);
  return storeEntries;
};
const _handleNft = contractName => (isMainChain, isFront) => async (req, res) => {
  const chainName = (isMainChain ? 'mainnet' : 'rinkeby') + (isFront ? '' : 'sidechain');
  const otherChainName = (isMainChain ? 'mainnet' : 'rinkeby');
  const _respond = (statusCode, body) => {
    res.statusCode = statusCode;
    _setCorsHeaders(res);
    res.end(body);
  };
  const _setCorsHeaders = res => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
  };
  const _maybeGetStoreEntries = () => (contractName === 'NFT' && !isFront) ? _getStoreEntries(isMainChain) : Promise.resolve([]);

try {
  const {method} = req;

  if (method === 'GET') {
    const {pathname: p} = url.parse(req.url, true);
    let match;
    if (match = p.match(/^\/([0-9]+)$/)) {
      const tokenId = parseInt(match[1], 10);

      const storeEntries = await _maybeGetStoreEntries();
      const token = await _getChainNft(contractName)(isMainChain, isFront)(tokenId, storeEntries);

      _setCorsHeaders(res);
      res.setHeader('Content-Type', 'application/json');
      _respond(200, JSON.stringify(token));
      /* res.end(JSON.stringify({
        "name": filename,
        "description": 'Hash ' + hash,
        "image": "https://preview.exokit.org/" + hash.slice(2) + '.' + ext + '/preview.png',
        "external_url": "https://app.webaverse.com?h=" + p.slice(1),
        // "background_color": "000000",
        "animation_url": `${storageHost}/${hash.slice(2)}/preview.${ext === 'vrm' ? 'glb' : ext}`,
        // "animation_url": "http://dl5.webmfiles.org/big-buck-bunny_trailer.webm",
        "properties": {
                "filename": filename,
                "hash": hash,
                "ext": ext,
                "rich_property": {
                        "name": "Name",
                        "value": "123",
                        "display_value": "123 Example Value",
                        "class": "emphasis",
                        "css": {
                                "color": "#ffffff",
                                "font-weight": "bold",
                                "text-decoration": "underline"
                        }
                },
                "array_property": {
                        "name": "Name",
                        "value": [1,2,3,4],
                        "class": "emphasis"
                }
        }
      })); */
    } else if (match = p.match(/^\/([0-9]+)-([0-9]+)$/)) {
      const startTokenId = parseInt(match[1], 10);
      const endTokenId = parseInt(match[2], 10);

      if (startTokenId >= 1 && endTokenId > startTokenId && (endTokenId - startTokenId) <= 100) {
        const storeEntries = await _maybeGetStoreEntries();
        
        const numTokens = endTokenId - startTokenId;
        const promises = Array(numTokens);
        for (let i = 0; i < numTokens; i++) {
          promises[i] = _getChainNft(contractName)(isMainChain, isFront)(startTokenId + i, storeEntries);
        }
        let tokens = await Promise.all(promises);
        tokens = tokens.filter(token => token !== null);
        tokens.sort((a, b) => a.id - b.id);
        if (contractName === 'NFT') {
          tokens = tokens.filter((token, i) => { // filter unique hashes
            for (let j = 0; j < i; j++) {
              if (tokens[j].properties.hash === token.properties.hash && token.properties.hash !== "") {
                return false;
              }
            }
            return true;
          });
        } else if (contractName === 'LAND') {
          tokens = tokens.filter(token => !!token.name);
        }

        _setCorsHeaders(res);
        res.setHeader('Content-Type', 'application/json');
        _respond(200, JSON.stringify(tokens));
        /* res.end(JSON.stringify({
          "name": filename,
          "description": 'Hash ' + hash,
          "image": "https://preview.exokit.org/" + hash.slice(2) + '.' + ext + '/preview.png',
          "external_url": "https://app.webaverse.com?h=" + p.slice(1),
          // "background_color": "000000",
          "animation_url": `${storageHost}/${hash.slice(2)}/preview.${ext === 'vrm' ? 'glb' : ext}`,
          // "animation_url": "http://dl5.webmfiles.org/big-buck-bunny_trailer.webm",
          "properties": {
                  "filename": filename,
                  "hash": hash,
                  "ext": ext,
                  "rich_property": {
                          "name": "Name",
                          "value": "123",
                          "display_value": "123 Example Value",
                          "class": "emphasis",
                          "css": {
                                  "color": "#ffffff",
                                  "font-weight": "bold",
                                  "text-decoration": "underline"
                          }
                  },
                  "array_property": {
                          "name": "Name",
                          "value": [1,2,3,4],
                          "class": "emphasis"
                  }
          }
        })); */
      } else {
        _respond(400, 'invalid range');
      }
    } else if (match = p.match(/^\/(0x[a-f0-9]+)$/i)) {
      const address = match[1];

      const mainnetAddress = await contracts[otherChainName + 'sidechain'].Account.methods.getMetadata(address, "mainnetAddress").call();

      const [
        nftBalance,
        nftMainnetBalance,
        storeEntries,
      ] = await Promise.all([
        contracts[chainName][contractName].methods.balanceOf(address).call(),
        contracts[otherChainName][contractName].methods.balanceOf(mainnetAddress).call(),
        _maybeGetStoreEntries(),
      ]);

      const promises = Array(nftBalance);
      for (let i = 0; i < nftBalance; i++) {
        promises[i] = _getChainOwnerNft(contractName)(isMainChain, isFront)(address, i, storeEntries);
      }
      let tokens = await Promise.all(promises);

      const mainnetPromises = Array(nftMainnetBalance);
      for (let i = 0; i < nftMainnetBalance; i++) {
        let id = await _getChainOwnerNft(contractName)(isMainChain, true)(address, i, storeEntries);
        mainnetPromises[i] = _getChainNft(contractName)(isMainChain, isFront)(id.id, storeEntries);
      }
      let mainnetTokens = await Promise.all(mainnetPromises);

      tokens = tokens.concat(mainnetTokens);
      // tokens = tokens.filter(token => token !== null);
      tokens.sort((a, b) => a.id - b.id);
      if (contractName === 'NFT') {
        tokens = tokens.filter((token, i) => { // filter unique hashes
          for (let j = 0; j < i; j++) {
            if (tokens[j].properties.hash === token.properties.hash && token.properties.hash !== '') {
              return false;
            }
          }
          return true;
        });
      } else if (contractName === 'LAND') {
        tokens = tokens.filter(token => !!token.name);
      }
      _respond(200, JSON.stringify(tokens));
    } else {
      _respond(404, 'not found');
    }
  } else {
    _respond(404, 'not found');
  }
} catch(err) {
  console.warn(err);

  _respond(500, JSON.stringify({
    error: err.stack,
  }));
}
};
const _handleTokens = _handleNft('NFT');
const _handleLand = _handleNft('LAND');

const _handleStore = isMainChain => async (req, res) => {
  const _respond = (statusCode, body) => {
    res.statusCode = statusCode;
    _setCorsHeaders(res);
    res.end(body);
  };
  const _setCorsHeaders = res => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
  };

try {
  const {method} = req;
  const {pathname: p} = url.parse(req.url);

  const _getBooths = async () => {
    const storeEntries = await _getStoreEntries(isMainChain);

    const booths = [];
    for (let i = 0; i < storeEntries.length; i++) {
      const store = storeEntries[i]
      const {tokenId, seller} = store;
      
      const token = await _getChainToken(isMainChain, false)(tokenId, storeEntries);
      
      let booth = booths.find(booth => booth.seller === seller);
      if (!booth) {
        booth = {
          seller,
          entries: [],
        };
        booths.push(booth);
      }
      booth.entries.push(token);
    }

    return booths;
  };

  let match;
  if (method === 'GET' & p === '/') {
    const booths = await _getBooths();
    _respond(200, JSON.stringify(booths));
  } else if (match = p.match(/^\/(0x[a-f0-9]+)$/i)) {
    const seller = match[1];
    let booths = await _getBooths();
    booths = booths.filter(booth => booth.seller === seller);
    _respond(200, JSON.stringify(booths));
  } else {
    _respond(404, 'not found');
  }
} catch(err) {
  console.warn(err);

  _respond(500, JSON.stringify({
    error: err.stack,
  }));
}
};

const proxy = httpProxy.createProxyServer({});
proxy.on('proxyRes', (proxyRes, req) => {
  if (proxyRes.headers['location']) {
    const o = new url.URL(proxyRes.headers['location'], req.url);
    // console.log('redirect location 1', req.url, proxyRes.headers['location'], o.href);
    o.host = o.host.replace('-', '--');
    o.host = o.protocol.slice(0, -1) + '-' + o.host.replace(/\./g, '-').replace(/:([0-9]+)$/, '-$1') + '.proxy.exokit.org';
    o.protocol = 'https:';
    proxyRes.headers['location'] = o.href;
  }
  proxyRes.headers['access-control-allow-origin'] = '*';
});
proxy.on('error', err => {
  console.warn(err.stack);
});

const presenceWss = new ws.Server({
  noServer: true,
});
presenceWss.on('connection', async (s, req/*, channels, saveHtml*/) => {
  const _transaction = tx => {
    s.send(JSON.stringify(tx));
  };
  eventsManager.on('transaction', _transaction);
  s.on('close', () => {
    eventsManager.removeListener('transaction', _transaction);
  });
});

const _req = protocol => (req, res) => {
try {

  const o = url.parse(protocol + '//' + (req.headers['host'] || '') + req.url);
  let match;
  if (o.host === 'login.exokit.org') {
    _handleLogin(req, res);
    return;
  } else if (o.host === 'mainnetsidechain.exokit.org') {
    _handleEthereum(8545)(req, res);
    return;
  } else if (o.host === 'rinkebysidechain.exokit.org') {
    _handleEthereum(8546)(req, res);
    return;
  } else if (o.host === 'accounts.webaverse.com' || o.host === 'mainnetsidechain-accounts.webaverse.com') {
    _handleAccounts(true)(req, res);
    return;
  } else if (o.host === 'rinkebysidechain-accounts.webaverse.com') {
    _handleAccounts(false)(req, res);
    return;
  } else if (o.host === 'analytics.webaverse.com') {
    _handleAnalyticsRequest(req, res);
    return;
  } else if (o.host === 'sign.exokit.org') {
    _handleSignRequest(req, res);
    return;
  } else if (o.host === 'oauth.exokit.org') {
    _handleOauth(req, res);
    return;
  } else if (o.host === 'profile.webaverse.com' || o.host === 'mainnetsidechain-profile.webaverse.com') {
    _handleProfile(true)(req, res);
    return;
  } else if (o.host === 'rinkebysidechain-profile.webaverse.com') {
    _handleProfile(false)(req, res);
    return;
  } else if (o.host === 'main.webaverse.com' || o.host === 'test.webaverse.com') {
    _handleProxyRoot(req, res);
    return;
  } else if (o.host === 'main.app.webaverse.com' || o.host === 'test.app.webaverse.com') {
    _handleProxyApp(req, res);
    return;
  } else if (o.host === 'mainnet-tokens.webaverse.com') {
    _handleTokens(true, true)(req, res);
    return;
  } else if (o.host === 'tokens.webaverse.com' || o.host === 'mainnetsidechain-tokens.webaverse.com') {
    _handleTokens(true, false)(req, res);
    return;
  } else if (o.host === 'rinkeby-tokens.webaverse.com') {
    _handleTokens(false, true)(req, res);
    return;
  } else if (o.host === 'rinkebysidechain-tokens.webaverse.com') {
    _handleTokens(false, false)(req, res);
    return;
  } else if (o.host === 'mainnet-land.webaverse.com') {
    _handleLand(true, true)(req, res);
    return;
  } else if (o.host === 'land.webaverse.com' || o.host === 'mainnetsidechain-land.webaverse.com') {
    _handleLand(true, false)(req, res);
    return;
  } else if (o.host === 'rinkeby-land.webaverse.com') {
    _handleLand(false, true)(req, res);
    return;
  } else if (o.host === 'rinkebysidechain-land.webaverse.com') {
    _handleLand(false, false)(req, res);
    return;
  } else if (o.host === 'worlds.exokit.org') {
    _handleWorldsRequest(req, res);
    return;
  /* } else if (o.host === 'storage.exokit.org' || o.host === 'storage.webaverse.com') {
    _handleStorageRequest(req, res);
    return; */
  } else if (o.host === 'store.webaverse.com' || o.host === 'mainnetsidechain-store.webaverse.com') {
    _handleStore(true)(req, res);
    return;
  } else if (o.host === 'rinkebysidechain-store.webaverse.com') {
    _handleStore(false)(req, res);
    return;
  }

  if (match = o.host.match(/^(.+)\.proxy\.exokit.org$/)) {
    const raw = match[1];
    const match2 = raw.match(/^(https?-)(.+?)(-[0-9]+)?$/);
    if (match2) {
      if (req.method === 'OPTIONS') {
        // res.statusCode = 200;
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', '*');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.end();
      } else {
        o.protocol = match2[1].replace(/-/g, ':');
        o.host = match2[2].replace(/--/g, '=').replace(/-/g, '.').replace(/=/g, '-').replace(/\.\./g, '-') + (match2[3] ? match2[3].replace(/-/g, ':') : '');
        const oldUrl = req.url;
        req.url = url.format(o);

        // console.log(oldUrl, '->', req.url);

        req.headers['user-agent'] = 'curl/1';
        delete req.headers['origin'];
        delete req.headers['referer'];

        proxy.web(req, res, {
          target: o.protocol + '//' + o.host,
          secure: false,
          changeOrigin: true,
        }, err => {
          console.warn(err.stack);

          res.statusCode = 500;
          res.end();
        });
      }
      return;
    }
  }

  res.statusCode = 404;
  res.end('host not found');
} catch(err) {
  console.warn(err.stack);

  res.statusCode = 500;
  res.end(err.stack);
}
};
const _ws = protocol => (req, socket, head) => {
  const host = req.headers['host'];
  if (host === 'events.exokit.org') {
    presenceWss.handleUpgrade(req, socket, head, s => {
      presenceWss.emit('connection', s, req);
    });
  /* if (host === 'presence.exokit.org') {
    presenceWss.handleUpgrade(req, socket, head, s => {
      presenceWss.emit('connection', s, req, webaverseChannels, true);
    });
  } else if (host === 'presence-tmp.exokit.org') {
    presenceWss.handleUpgrade(req, socket, head, s => {
      presenceWss.emit('connection', s, req, webaverseTmpChannels, false);
    }); */
  } else {
    const o = url.parse(protocol + '//' + (req.headers['host'] || '') + req.url);
    console.log('got', protocol, req.headers['host'], req.url, o);
    let match;
    if (match = o.host.match(/^(.+)\.proxy\.exokit.org$/)) {
      const raw = match[1];
      const match2 = raw.match(/^(https?-)(.+?)(-[0-9]+)?$/);
      console.log('match 2', raw, match2);
      if (match2) {
        /* o.protocol = match2[1].replace(/-/g, ':');
        o.host = match2[2].replace(/--/g, '=').replace(/-/g, '.').replace(/=/g, '-').replace(/\.\./g, '-') + (match2[3] ? match2[3].replace(/-/g, ':') : '');
        const oldUrl = req.url;
        req.url = url.format(o);

        console.log(oldUrl, '->', req.url); */

        const hostname = match2[2].replace(/--/g, '=').replace(/-/g, '.').replace(/=/g, '-').replace(/\.\./g, '-') + (match2[3] ? match2[3].replace(/-/g, ':') : '');
        const host = 'wss://' + hostname;
        // const host = 'wss://mystifying-artificer.reticulum.io/socket/websocket?vsn=2.0.0';
        req.headers['host'] = hostname;
        // o.host = hostname;
        // req.url = url.format(o);

        // req.headers['user-agent'] = 'curl/1';
        req.headers['origin'] = 'https://hubs.mozilla.com';
        delete req.headers['referer'];
        
        console.log('redirect', [host, req.url, req.headers]);

        proxy.ws(req, socket, head, {
          target: host,
        });
        return;
      }
    }
    
    socket.destroy();
  }
};

{
  addresses = await fetch('https://contracts.webaverse.com/config/addresses.js').then(res => res.text()).then(s => JSON.parse(s.replace(/^\s*export\s*default\s*/, '')));
  abis = await fetch('https://contracts.webaverse.com/config/abi.js').then(res => res.text()).then(s => JSON.parse(s.replace(/^\s*export\s*default\s*/, '')));
  const ethereumHostAddress = await new Promise((accept, reject) => {
    dns.resolve4(ethereumHost, (err, addresses) => {
      if (!err) {
        if (addresses.length > 0) {
          accept(addresses[0]);
        } else {
          reject(new Error('no addresses resolved for ' + ethereumHostname));
        }
      } else {
        reject(err);
      }
    });
  });
  gethNodeUrl = `http://${ethereumHostAddress}`;
  
  web3 = {
    mainnet: new Web3(new Web3.providers.HttpProvider(`https://mainnet.infura.io/v3/${infuraProjectId}`)),
    mainnetsidechain: new Web3(new Web3.providers.HttpProvider(gethNodeUrl + ':8545')),
    rinkeby: new Web3(new Web3.providers.HttpProvider(`https://rinkeby.infura.io/v3/${infuraProjectId}`)),
    rinkebysidechain: new Web3(new Web3.providers.HttpProvider(gethNodeUrl + ':8546')),
  };

  contracts = {
    mainnet: {
      Account: new web3.mainnet.eth.Contract(abis.Account, addresses.mainnet.Account),
      FT: new web3.mainnet.eth.Contract(abis.FT, addresses.mainnet.FT),
      FTProxy: new web3.mainnet.eth.Contract(abis.FTProxy, addresses.mainnet.FTProxy),
      NFT: new web3.mainnet.eth.Contract(abis.NFT, addresses.mainnet.NFT),
      NFTProxy: new web3.mainnet.eth.Contract(abis.NFTProxy, addresses.mainnet.NFTProxy),
      Trade: new web3.mainnet.eth.Contract(abis.Trade, addresses.mainnet.Trade),
      LAND: new web3.mainnet.eth.Contract(abis.LAND, addresses.mainnet.LAND),
      LANDProxy: new web3.mainnet.eth.Contract(abis.LANDProxy, addresses.mainnet.LANDProxy),
    },
    mainnetsidechain: {
      Account: new web3.mainnetsidechain.eth.Contract(abis.Account, addresses.mainnetsidechain.Account),
      FT: new web3.mainnetsidechain.eth.Contract(abis.FT, addresses.mainnetsidechain.FT),
      FTProxy: new web3.mainnetsidechain.eth.Contract(abis.FTProxy, addresses.mainnetsidechain.FTProxy),
      NFT: new web3.mainnetsidechain.eth.Contract(abis.NFT, addresses.mainnetsidechain.NFT),
      NFTProxy: new web3.mainnetsidechain.eth.Contract(abis.NFTProxy, addresses.mainnetsidechain.NFTProxy),
      Trade: new web3.mainnetsidechain.eth.Contract(abis.Trade, addresses.mainnetsidechain.Trade),
      LAND: new web3.mainnetsidechain.eth.Contract(abis.LAND, addresses.mainnetsidechain.LAND),
      LANDProxy: new web3.mainnetsidechain.eth.Contract(abis.LANDProxy, addresses.mainnetsidechain.LANDProxy),
    },
    rinkeby: {
      Account: new web3.rinkeby.eth.Contract(abis.Account, addresses.rinkeby.Account),
      FT: new web3.rinkeby.eth.Contract(abis.FT, addresses.rinkeby.FT),
      FTProxy: new web3.rinkeby.eth.Contract(abis.FTProxy, addresses.rinkeby.FTProxy),
      NFT: new web3.rinkeby.eth.Contract(abis.NFT, addresses.rinkeby.NFT),
      NFTProxy: new web3.rinkeby.eth.Contract(abis.NFTProxy, addresses.rinkeby.NFTProxy),
      Trade: new web3.rinkeby.eth.Contract(abis.Trade, addresses.rinkeby.Trade),
      LAND: new web3.rinkeby.eth.Contract(abis.LAND, addresses.rinkeby.LAND),
      LANDProxy: new web3.rinkeby.eth.Contract(abis.LANDProxy, addresses.rinkeby.LANDProxy),
    },
    rinkebysidechain: {
      Account: new web3.rinkebysidechain.eth.Contract(abis.Account, addresses.rinkebysidechain.Account),
      FT: new web3.rinkebysidechain.eth.Contract(abis.FT, addresses.rinkebysidechain.FT),
      FTProxy: new web3.rinkebysidechain.eth.Contract(abis.FTProxy, addresses.rinkebysidechain.FTProxy),
      NFT: new web3.rinkebysidechain.eth.Contract(abis.NFT, addresses.rinkebysidechain.NFT),
      NFTProxy: new web3.rinkebysidechain.eth.Contract(abis.NFTProxy, addresses.rinkebysidechain.NFTProxy),
      Trade: new web3.rinkebysidechain.eth.Contract(abis.Trade, addresses.rinkebysidechain.Trade),
      LAND: new web3.rinkebysidechain.eth.Contract(abis.LAND, addresses.rinkebysidechain.LAND),
      LANDProxy: new web3.rinkebysidechain.eth.Contract(abis.LANDProxy, addresses.rinkebysidechain.LANDProxy),
    },
  };

  /* web3.mainnetsidechain.eth.getPastLogs({
    fromBlock: 0,
    toBlock: 'latest',
    address: FTAddressSidechain,
  }).then(result => {
    console.log('got res', result);
  }); */
}

const server = http.createServer(_req('http:'));
server.on('upgrade', _ws('http:'));
const server2 = https.createServer({
  cert: CERT,
  key: PRIVKEY,
}, _req('https:'));
server2.on('upgrade', _ws('https:'));

const _warn = err => {
  console.warn('uncaught: ' + err.stack);
};
process.on('uncaughtException', _warn);
process.on('unhandledRejection', _warn);

server.listen(PORT);
server2.listen(443);

console.log(`http://127.0.0.1:${PORT}`);
console.log(`https://127.0.0.1:443`);

})();
