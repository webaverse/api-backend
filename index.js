require('dotenv').config();
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
const bip39 = require('bip39');
const {hdkey} = require('ethereumjs-wallet');
const {getDynamoItem, getDynamoAllItems, putDynamoItem} = require('./aws.js');
const {getRedisItem, getRedisAllItems, parseRedisItems} = require('./redis.js');
const {getExt, makePromise} = require('./utils.js');
const Timer = require('./timer.js');
const {getStoreEntries, getChainNft, getAllWithdrawsDeposits} = require('./tokens.js');
const {getBlockchain, getPolygonNFTCollection} = require('./blockchain.js');
// const browserManager = require('./browser-manager.js');
const {accountKeys, ids, nftIndexName, redisPrefixes, mainnetSignatureMessage, cacheHostUrl} = require('./constants.js');
const {connect: redisConnect, getRedisClient} = require('./redis');
const ethereumJsUtil = require('./ethereumjs-util.js');
const gotNfts = require('got-nfts');
const OpenAI = require('openai-api');
const GPT3Encoder = require('gpt-3-encoder');
const Web3 = require('web3');

const _jsonParse = s => {
  try {
    return JSON.parse(s);
  } catch (e) {
    return {};
  }
}
const _readJson = async request => {
  const buffers = [];
  return new Promise((accept, reject) => {
    request.on('data', chunk => buffers.push(chunk));
    request.on('end', () => accept(_jsonParse(Buffer.concat(buffers).toString('utf8'))));
    request.on('error', reject);
  });
};

let config = fs.existsSync('./config.json') ? require('./config.json') : null;

const accessKeyId = process.env.accessKeyId || config.accessKeyId;
const secretAccessKey = process.env.secretAccessKey || config.secretAccessKey;
const githubClientId = process.env.githubClientId || config.githubClientId;
const githubClientSecret = process.env.githubClientSecret || config.githubClientSecret;
const discordClientId = process.env.discordClientId || config.discordClientId;
const discordClientSecret = process.env.discordClientSecret || config.discordClientSecret;

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
// const stripe = Stripe(stripeClientSecret);
// const accountManager = require('./account-manager.js');
// const eventsManager = require('./events-manager.js');

const Discord = require('discord.js');

const getAiPrefix = (() => {
  let aiPrefix = null;
  let aiPrefixLoad = null;
  return async () => {
    if (aiPrefix) {
      return aiPrefix;
    } else {
      if (!aiPrefixLoad) {
        aiPrefixLoad = (async () => {
          const res = await fetch(`https://webaverse.github.io/code-ai/ai-prefix.js`);
          const text = await res.text();
          return text;
        })();
        aiPrefixLoad.then(text => {
          aiPrefix = text;
          aiPrefixLoad = null;
          setTimeout(() => {
            aiPrefix = null;
          }, 60 * 1000);
        });
      }
      return await aiPrefixLoad;
    }
  };
})();

const engines = {
  gpt3: 'text-davinci-001',
  codex: 'davinci-codex',
  lore: 'gpt-neo-20b',
};
const camelToUnderscore = key => {
  let result = key.replace(/([A-Z])/g, " $1");
  return result.split(' ').join('_').toLowerCase();
};
const _makeSendRequestRewriter = (OPEN_AI_URL, engine) => async function(url, method, opts = {}) {
  // console.log('got req', url, method, opts);

  url = `${OPEN_AI_URL}/engines/${engine}/completions`;

  const data = {};
  for (const key in opts) {
    data[camelToUnderscore(key)] = opts[key];
  }

  const rs = await new Promise((accept, reject) => {
    const req = https.request(url, {
      method,
      headers: {
        'Authorization': `Bearer ${this._api_key}`,
        'Content-Type': 'application/json'
      }
    }, res => {
      res.setEncoding('utf8');
      accept(res);
    });
    req.end(Object.keys(data).length ? JSON.stringify(data) : '');
    req.on('error', reject);
  });
  return rs;
}
const openai = new OpenAI(config.openAiKey);
openai._send_request = _makeSendRequestRewriter('https://api.openai.com/v1', engines.gpt3);
const openaiCodex = new OpenAI(config.openAiKey);
openaiCodex._send_request = _makeSendRequestRewriter('https://api.openai.com/v1', engines.codex);
const gooseAiLore = new OpenAI(config.gooseAiKey);
gooseAiLore._send_request = _makeSendRequestRewriter('https://api.goose.ai/v1', engines.lore);
const _openAiCodex = async (prompt, {
  stop,
  max_tokens = NaN,
  temperature,
  top_p,
}) => {
  const maxTokens = 4096;
  if (isNaN(max_tokens)) {
    max_tokens = maxTokens - GPT3Encoder.encode(prompt).length;
  }

  const o = {
    engine: engines.codex,
    prompt,
    stop,
    max_tokens,
    stream: true,
  };
  if (typeof temperature === 'number') {
    o.temperature = temperature;
  }
  if (typeof top_p === 'number') {
    o.top_p = top_p;
  }
  const gptRes = await openAiCodex.complete(o);
  return gptRes;
};
const _gooseAiLore = async (prompt, {
  stop,
  max_tokens = NaN,
  temperature,
  top_p,
}) => {
  const maxTokens = 1024;
  if (isNaN(max_tokens)) {
    max_tokens = maxTokens - GPT3Encoder.encode(prompt).length;
  }
  const o = {
    engine: engines.lore,
    prompt,
    stop: stop ? [stop] : [],
    max_tokens,
    stream: true,
  };
  temperature = +temperature;
  if (!isNaN(temperature)) {
    o.temperature = temperature;
  }
  top_p = +top_p;
  if (!isNaN(top_p)) {
    o.top_p = top_p;
  }
  const gptRes = await gooseAiLore.complete(o);
  return gptRes;
};

// const api = require('./api.js');
// const { _handleStorageRequest } = require('./routes/storage.js');
// const { _handleAccountsRequest } = require('./routes/accounts.js');
// const { _handlePreviewRequest } = require('./routes/preview.js')
const { worldManager, _handleWorldsRequest, _startWorldsRoute } = require('./routes/worlds.js');
const { _handleSignRequest } = require('./routes/sign.js');
const { _handleUnlockRequest, _handleLockRequest, _handleDecryptRequest, _isCollaborator, _isSingleCollaborator} = require('./routes/unlock.js');
const { _handleAnalyticsRequest } = require('./routes/analytics.js');

let CERT = null;
let PRIVKEY = null;

const fullchainPath = './certs/fullchain.pem';
const privkeyPath = './certs/privkey.pem';
try {
  CERT = fs.readFileSync(fullchainPath);
} catch (err) {
  console.warn(`failed to load ${fullchainPath}`);
}
try {
  PRIVKEY = fs.readFileSync(privkeyPath);
} catch (err) {
  console.warn(`failed to load ${privkeyPath}`);
}

const PORT = parseInt(process.env.HTTP_PORT, 10) || 80;
// const filterTopic = 'webxr-site';
const tableName = 'users';

const defaultAvatarPreview = `https://preview.exokit.org/[https://raw.githubusercontent.com/avaer/vrm-samples/master/vroid/male.vrm]/preview.png`;

Error.stackTraceLimit = 300;

const emailRegex = /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/;
const codeTestRegex = /^[0-9]{6}$/;
const discordIdTestRegex = /^[0-9]+$/;
const twitterIdTestRegex = /^@?(\w){1,15}$/;

function _randomString() {
  return Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 5);
}

const maxEmailsPerIp = 5;
const maxEmailsRefillTime = 10 * 60 * 1000;
class Throttler {
  constructor() {
    this.tickets = {};
  }
  getTicket(ip) {
    this.tickets[ip] ||= 0;
    if (this.tickets[ip] < maxEmailsPerIp) {
      this.tickets[ip]++;
      setTimeout(() => {
        this.tickets[ip]--;
      }, maxEmailsRefillTime);
      return true;
    } else {
      return false;
    }
  }
}

(async () => {

await worldManager.waitForLoad();

const throttler = new Throttler();

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

    console.log('got login', JSON.stringify({method, p, query}, null, 2));

    if (method === 'POST') {
      let {email, code, token, discordcode, discordid, twittercode, twitterid, autoip, mnemonic, signature, nonce, redirect_uri} = query;
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
          
          const ok = throttler.getTicket(req.connection.remoteAddress);
          console.log(`login with email ${email} @ ${req.connection.remoteAddress} ${ok ? 'OK' : 'BLOCKED'}`);
          
          if (ok) {
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
          } else {
            _respond(429, JSON.stringify({}));
          }
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
            redirect_uri: redirect_uri || 'https://webaverse.com/login',
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
      } else if (signature && nonce) {
        const proofOfAddressMessage = `Proof of address. Nonce: ` + nonce;
        
        const {r, s, v} = ethereumJsUtil.fromRpcSig(signature);
        
        const prefix = Buffer.from("\x19Ethereum Signed Message:\n");
        const bs = [
          prefix,
          Buffer.from(String(proofOfAddressMessage.length)),
          Buffer.from(proofOfAddressMessage),
        ];
        const prefixedMsg = ethereumJsUtil.sha3(
          '0x' + Buffer.concat(bs).toString('hex')
        );

        const pubKey  = ethereumJsUtil.ecrecover(prefixedMsg, v, r, s);
        const addrBuf = ethereumJsUtil.pubToAddress(pubKey);
        const address = ethereumJsUtil.bufferToHex(addrBuf);
        
        console.log('recovered signature 1', {address, nonce});
        
        const nonceSeen = await (async () => {
          const nonceKey = address + ':' + nonce + '.nonce';
          const tokenItem = await ddb.getItem({
            TableName: tableName,
            Key: {
              email: {S: nonceKey},
            },
          }).promise();
          if (tokenItem.Item) {
            return true;
          } else {
            await ddb.putItem({
              TableName: tableName,
              Item: {
                email: {S: nonceKey},
                used: {S: '1'},
              }
            }).promise();
            return false;
          }
        })();
        console.log('recovered signature 2', {address, nonce, nonceSeen});
        if (!nonceSeen) {
          const tokenItem = await ddb.getItem({
            TableName: tableName,
            Key: {
              email: {S: address + '.address'},
            },
          }).promise();
          let mnemonic = (tokenItem.Item && tokenItem.Item.mnemonic) ? tokenItem.Item.mnemonic.S : null;
          // let addr = (tokenItem.Item && tokenItem.Item.address) ? tokenItem.Item.address.S : null;
          
          if (!mnemonic) {
            mnemonic = bip39.generateMnemonic();
          }

          await ddb.putItem({
            TableName: tableName,
            Item: {
              email: {S: address + '.address'},
              mnemonic: {S: mnemonic},
              // address: {S: addr},
            }
          }).promise();
          
          _setCorsHeaders(res);
          res.end(JSON.stringify({mnemonic}));
        } else {
          _setCorsHeaders(res);
          res.statusCode = 403;
          res.end();
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

    const {
      gethNodeUrl,
    } = await getBlockchain();

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

const _handleAccounts = chainName => async (req, res) => {
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
  const _makeFakeAccount = address => {
    const account = {
      address,
    };
    for (const k of accountKeys) {
      account[k] = '';
    }
    return account;
  };
  const _getAccount = async address => getRedisItem(address, redisPrefixes.mainnetsidechainAccount)
    .then(o => o.Item || _makeFakeAccount(address));

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
      let accounts = await getRedisAllItems(redisPrefixes.mainnetsidechainAccount);
      accounts = accounts.filter(a => a.id !== ids.lastCachedBlockAccount);
      _respond(200, JSON.stringify(accounts));
    } else {
      const match = p.match(/^\/(0x[a-f0-9]+)$/i);
      if (match) {
        const address = match[1];
        const result = await _getAccount(address);
        console.log('fetched account', address, result);
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

const _handleProfile = chainName => async (req, res) => {
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

      const storeEntries = await getStoreEntries(chainName);
      const tokens = await Promise.all(tokenIds.map(tokenId => getChainToken(chainName)(tokenId, storeEntries)));

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
      o.host = o.protocol.slice(0, -1) + '-' + o.host.replace(/\./g, '-').replace(/:([0-9]+)$/, '-$1') + '.proxy.webaverse.com';
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
      o.host = o.protocol.slice(0, -1) + '-' + o.host.replace(/\./g, '-').replace(/:([0-9]+)$/, '-$1') + '.proxy.webaverse.com';
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
const _isTokenZero = token => {
  return (
    token.properties.hash === "" &&
    token.owner.address === "0x0000000000000000000000000000000000000000"
  ) ||
  (
    token.properties.hash.startsWith('0xdeaddeaddeaddeaddead') &&
    token.owner.address.toLowerCase().startsWith('0xdeaddeaddeaddeaddead')
  )
};
const _handleCachedNft = contractName => (chainName, isAll) => async (req, res) => {
  const _respond = (statusCode, body) => {
    res.statusCode = statusCode;
    _setCorsHeaders(res);
    res.end(body);
    
    // t.end();
  };
  const _setCorsHeaders = res => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
  };
  /* const _maybeGetStoreEntries = () =>
    (contractName === 'NFT' && !isFront)
      ? getStoreEntries(isMainChain)
      : Promise.resolve([]); */

  try {
  const {method} = req;

  if (method === 'GET') {
    const {pathname: p, query} = url.parse(req.url, true);
    let match;
    if (match = p.match(/^\/([0-9]+)$/)) {
      const tokenId = parseInt(match[1], 10);

      // const t = new Timer('get nft');
      let o = await getRedisItem(tokenId, redisPrefixes.mainnetsidechainNft);
      // t.end();
      let token = o.Item;

      _setCorsHeaders(res);
      if (token) {
        res.setHeader('Content-Type', 'application/json');
        _respond(200, JSON.stringify(token));
      } else {
        _respond(404, JSON.stringify(null));
      }
    } else if (match = p.match(/^\/([0-9]+)-([0-9]+)$/)) {
      const startTokenId = parseInt(match[1], 10);
      const endTokenId = parseInt(match[2], 10);

      if (startTokenId >= 1 && endTokenId > startTokenId && (endTokenId - startTokenId) <= 100) {
        const p = makePromise();
        const args = `${nftIndexName} * filter id ${startTokenId} ${endTokenId} LIMIT 0 1000000`.split(' ').concat([(err, result) => {
          if (!err) {
            console.log('got result', result);
            const items = parseRedisItems(result);
            p.accept({
              Items: items,
            });
          } else {
            p.reject(err);
          }
        }]);
        redisClient.ft_search.apply(redisClient, args);
        const o = await p;

        let tokens = o.Items;
        tokens = tokens.filter(token => token !== null);
        tokens.sort((a, b) => a.id - b.id);
        if (contractName === 'NFT') {
          tokens = tokens.filter((token, i) => { // filter unique hashes
            if (_isTokenZero(token)) {
              return false;
            }
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

      const [
        mainnetTokens,
        sidechainTokens,
      ] = await Promise.all([
        (async () => {
          if (isAll) {
            let mainnetAddress = null;
            const account = await getRedisItem(address, redisPrefixes.mainnetsidechainAccount);
            const signature = account?.metadata?.['mainnetAddress'];
            if (signature) {
              mainnetAddress = await web3.testnet.eth.accounts.recover(mainnetSignatureMessage, signature);
            }
            if (mainnetAddress) {
              const p = makePromise();
              const args = `${nftIndexName} ${JSON.stringify(mainnetAddress)} INFIELDS 1 currentOwnerAddress LIMIT 0 1000000`.split(' ').concat([(err, result) => {
                if (!err) {
                  const items = parseRedisItems(result);
                  // console.log('got result', result);
                  p.accept({
                    Items: items,
                  });
                } else {
                  p.reject(err);
                }
              }]);
              redisClient.ft_search.apply(redisClient, args);
              const o = await p;

              return (o && o.Items) || [];
            } else {
              return [];
            }
          } else {
            return [];
          }
        })(),
        (async () => {
          const p = makePromise();
          const args = `${nftIndexName} ${JSON.stringify(address)} INFIELDS 1 currentOwnerAddress LIMIT 0 1000000`.split(' ').concat([(err, result) => {
            if (!err) {
              const items = parseRedisItems(result);
              // console.log('got result', result);
              p.accept({
                Items: items,
              });
            } else {
              p.reject(err);
            }
          }]);
          redisClient.ft_search.apply(redisClient, args);
          const o = await p;
          return (o && o.Items) || [];
        })(),
      ]);
      let tokens = sidechainTokens.concat(mainnetTokens);
      // tokens = tokens.filter(token => token !== null);
      tokens.sort((a, b) => a.id - b.id);
      if (contractName === 'NFT') {
        tokens = tokens.filter((token, i) => { // filter unique hashes
          if (_isTokenZero(token)) {
            return false;
          }
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
      _respond(200, JSON.stringify(tokens));
    } else if (match = p.match(/^\/isCollaborator\/([0-9]+)\/(0x[a-f0-9]+)$/i)) {
      const tokenId = parseInt(match[1], 10);
      const address = match[2];
      
      const isCollaborator = await _isCollaborator(tokenId, address);

      _setCorsHeaders(res);
      res.setHeader('Content-Type', 'application/json');
      _respond(200, JSON.stringify(isCollaborator));
    } else if (match = p.match(/^\/isSingleCollaborator\/([0-9]+)\/(0x[a-f0-9]+)$/i)) {
      const tokenId = parseInt(match[1], 10);
      const address = match[2];
      
      const isSingleCollaborator = await _isSingleCollaborator(tokenId, address);

      _setCorsHeaders(res);
      res.setHeader('Content-Type', 'application/json');
      _respond(200, JSON.stringify(isSingleCollaborator));
    } else if (match = req.url.match(/^\/search\?(.+)$/)) {
      const qs = querystring.parse(match[1]);
      const {q = '*', ext, owner, minter} = qs;
      if (q) {
        const regex = /(\w+)/g;
        const words = [];
        let match;
        while (match = regex.exec(q)) {
          words.push(`%${match[1]}%`);
        }
        
        // console.log('got words', words, [`${nftIndexName}`].concat(words.join(' ')));
        
        let filters = [];
        if (owner) {
          if (filters.length > 0) {
            filters = ['&&'].concat(filters);
          }
          filters.push(`@currentOwnerAddress==${JSON.stringify(owner)}`);
        }
        if (minter) {
          if (filters.length > 0) {
            filters = ['&&'].concat(filters);
          }
          filters.push(`@minterAddress==${JSON.stringify(minter)}`);
        }
        if (filters.length > 0) {
          filters.push('GROUPBY', '1', '@id', 'filter');
        }
        
        const p = makePromise();
        const args = [nftIndexName]
          .concat(words.join(' '))
          .concat(['LIMIT', '0', '1000000'])
          .concat(filters)
          .concat([
            (err, result) => {
              if (!err) {
                const items = parseRedisItems(result);
                // console.log('got result', result);
                p.accept({
                  Items: items,
                });
              } else {
                p.reject(err);
              }
            }]);
        redisClient.ft_search.apply(redisClient, args);
        const o = await p;
        const tokens = (o && o.Items) || [];
        _respond(200, JSON.stringify(tokens));
      } else {
        _respond(400, 'no query string');
      }
    } else if (p === "/getPolygonNFT") { // match = req.url.match(/^\/getPolygonNFT\?(.+)$/)
        const {collectionAddress, walletAddress} = query;
        let token = await getPolygonNFTCollection(collectionAddress, walletAddress);
        _setCorsHeaders(res);
        if (token) {
            res.setHeader('Content-Type', 'application/json');
            _respond(200, JSON.stringify(token));
        } else {
            _respond(404, JSON.stringify(null));
        }
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
const _handleChainNft = contractName => (chainName, isAll) => async (req, res) => {
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
  const _maybeGetStoreEntries = () => (contractName === 'NFT' && !chainName.includes('testnet')) ? getStoreEntries(chainName) : Promise.resolve([]);

try {
  const {method} = req;

  if (method === 'GET') {
    const {pathname: p} = url.parse(req.url, true);
    let match;
    if (match = p.match(/^\/([0-9]+)$/)) {
      const tokenId = parseInt(match[1], 10);

      const storeEntries = await _maybeGetStoreEntries();
      const {
        mainnetDepositedEntries,
        mainnetWithdrewEntries,
        sidechainDepositedEntries,
        sidechainWithdrewEntries,
        polygonDepositedEntries,
        polygonWithdrewEntries,
      } = await getAllWithdrawsDeposits(contractName)(chainName);
      const token = await getChainNft(contractName)(chainName)(
        tokenId,
        storeEntries,
        mainnetDepositedEntries,
        mainnetWithdrewEntries,
        sidechainDepositedEntries,
        sidechainWithdrewEntries,
        polygonDepositedEntries,
        polygonWithdrewEntries,
      );

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
        const {
          mainnetDepositedEntries,
          mainnetWithdrewEntries,
          sidechainDepositedEntries,
          sidechainWithdrewEntries,
          polygonDepositedEntries,
          polygonWithdrewEntries,
        } = await getAllWithdrawsDeposits(contractName)(chainName);
        
        if (!mainnetDepositedEntries) {
          console.log('fetch from chain name', chainName);
          throw new Error('fail');
        }
        
        const numTokens = endTokenId - startTokenId;
        const promises = Array(numTokens);
        for (let i = 0; i < numTokens; i++) {
          promises[i] = getChainNft(contractName)(chainName)(
            startTokenId + i,
            storeEntries,
            mainnetDepositedEntries,
            mainnetWithdrewEntries,
            sidechainDepositedEntries,
            sidechainWithdrewEntries,
            polygonDepositedEntries,
            polygonWithdrewEntries,
          );
        }
        let tokens = await Promise.all(promises);
        tokens = tokens.filter(token => token !== null);
        tokens.sort((a, b) => a.id - b.id);
        if (contractName === 'NFT') {
          tokens = tokens.filter((token, i) => { // filter unique hashes
            if (_isTokenZero(token)) {
                return false;
            }
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

      const signature = await contracts[NetworkNames.mainnetsidechain].Account.methods.getMetadata(address, "mainnetAddress").call();

      let mainnetAddress = null;
      if (signature !== "") {
        mainnetAddress = await web3.testnet.eth.accounts.recover("Connecting mainnet address.", signature);
      }

      const [
        nftBalance,
        storeEntries,
        {
          mainnetDepositedEntries,
          mainnetWithdrewEntries,
          sidechainDepositedEntries,
          sidechainWithdrewEntries,
          polygonDepositedEntries,
          polygonWithdrewEntries,
        },
      ] = await Promise.all([
        contracts[chainName][contractName].methods.balanceOf(address).call(),
        _maybeGetStoreEntries(),
        getAllWithdrawsDeposits(contractName)(chainName),
      ]);

      const promises = Array(nftBalance);
      for (let i = 0; i < nftBalance; i++) {
        promises[i] = getChainOwnerNft(contractName)(chainName)(address, i, storeEntries, mainnetDepositedEntries, mainnetWithdrewEntries, sidechainDepositedEntries, sidechainWithdrewEntries, polygonDepositedEntries, polygonWithdrewEntries);
      }
      let tokens = await Promise.all(promises);

      if (isAll && mainnetAddress) {
        const nftMainnetBalance = await contracts[otherChainName][contractName].methods.balanceOf(mainnetAddress).call();
        const mainnetPromises = Array(nftMainnetBalance);
        for (let i = 0; i < nftMainnetBalance; i++) {
          let id = await getChainOwnerNft(contractName)(chainName)(address, i, storeEntries, mainnetDepositedEntries, mainnetWithdrewEntries, sidechainDepositedEntries, sidechainWithdrewEntries, polygonDepositedEntries, polygonWithdrewEntries);
          mainnetPromises[i] = getChainNft(contractName)(chainName)(id.id, storeEntries, mainnetDepositedEntries, mainnetWithdrewEntries, sidechainDepositedEntries, sidechainWithdrewEntries, polygonDepositedEntries, polygonWithdrewEntries);
        }
        let mainnetTokens = await Promise.all(mainnetPromises);

        tokens = tokens.concat(mainnetTokens);
      }
      // tokens = tokens.filter(token => token !== null);
      tokens.sort((a, b) => a.id - b.id);
      if (contractName === 'NFT') {
        tokens = tokens.filter((token, i) => { // filter unique hashes
          if (_isTokenZero(token)) {
            return false;
          }
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
const _handleTokens = _handleCachedNft('NFT');
// const _handleLand = _handleChainNft('LAND');
const _handleLand = tokenBName => (req, res) => {
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
  _respond(200, JSON.stringify([]));
};
const _handleGraph = async (req, res) => {
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
    let match;
    if (match = p.match(/^\/accounts\/(0x[0-9a-f]+)$/i)) {
      const accountAddress = match[1];
      const metadata = await gotNfts.fetchNftsMetadata(accountAddress);
      
      _setCorsHeaders(res);
      _respond(200, JSON.stringify(metadata));
    } else if (match = p.match(/^\/tokens\/(0x[0-9a-f]+)\/([0-9]+)$/i)) {
      const contractAddress = match[1];
      const tokenId = parseInt(match[2], 10);
      const metadata = await gotNfts.fetchNftMetadata(contractAddress, tokenId);
      
      _setCorsHeaders(res);
      _respond(200, JSON.stringify(metadata));
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

const _handleTokenIds = chainName => async (req, res) => {
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
  const web3 = new Web3();
  const query = url.parse(req.url,true).query;
  const ownerAddress = query.address;
  if (!web3.utils.isAddress(ownerAddress)) {
    _respond(400, 'invalid address');
    return;
  }
  let o = await getRedisItem(ownerAddress, redisPrefixes.WebaverseERC721);
  if (!o) {
    _respond(404, 'Record Not Found');
    return;
  }
  return _respond(200, JSON.stringify(o));
}


const _handleStore = chainName => async (req, res) => {
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
    const storeEntries = await getStoreEntries(chainName);

    const booths = [];
    for (let i = 0; i < storeEntries.length; i++) {
      const store = storeEntries[i]
      const {tokenId, seller} = store;

      if (tokenId) {
        const token = await getChainToken(chainName)(tokenId, storeEntries);

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

const _handleAi = async (req, res) => {
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
  const o = url.parse(req.url, true);
  const {pathname: p} = o;
  
  console.log('got ai hit', req.method, o, req.headers);
  
  if (req.method === 'OPTIONS') {
    _setCorsHeaders(res);
    res.end();
  } else if (req.method === 'GET' && p === '/') {
    _setCorsHeaders(res);

    const k = o.query.k;
    if (k === config.devPassword) {
      const p = o.query.p;
      const e = o.query.e;
      const l = parseInt(o.query.l, 10);
      const t = parseInt(o.query.t, 10);
      const tp = parseInt(o.query.tp, 10);
      /* const opts = {
        stop: e,
        max_tokens: l,
        temperature: t,
        top_p: tp,
      }; */
      
      /* const b = await new Promise((accept, reject) => {
        const bs = [];
        req.on('data', d => {
          bs.push(d);
        });
        req.on('end', () => {
          const b = Buffer.concat(bs);
          bs.length = 0;
          accept(b);
        });
        req.on('error', reject);
      });
      const s = b.toString('utf8');
      const o = JSON.parse(s); */
      const opts = {
        engine: engines.gpt3,
        stream: true,
        prompt: p, // 'this is a test',
        maxTokens: l, // 5,
        temperature: t, // 0.9,
        topP: tp, // 1,
        // presencePenalty: o.presencePenalty, // 0,
        // frequencyPenalty: o.frequencyPenalty, // 0,
        // bestOf: o.bestOf, // 1,
        // n: o.n, // 1,
        stop: e, // ['\n']
      };
      console.log('got opts', opts);

      const proxyRes = await openai.complete(opts);

      if (proxyRes) {
        for (const key in proxyRes.headers) {
          const value = proxyRes.headers[key];
          res.setHeader(key, value);
        }
        // console.log('render');
        proxyRes.pipe(res);
        proxyRes.on('data', d => {
          console.log('lore data', d.toString('utf8'));
        });
      } else {
        // console.warn('lore bad status code', proxyRes.statusCode);
        proxyRes.setEncoding('utf8');
        proxyRes.on('data', s => {
          console.log('lore error data', s);
        });
        res.setHeader('Content-Type', 'text/event-stream');
        res.end('data: [DONE]');
      }

      // console.log('got response', gptResponse);
      // console.log(gptResponse.data);
      // res.end(JSON.stringify(gptResponse.data));
    } else {
      res.statusCode = 401;
      res.end('unauthorized');
    }
  } else if (req.method === 'GET' && p === '/code') {
    _setCorsHeaders(res);

    const aiPrefix = await getAiPrefix();

    const p = decodeURIComponent(o.query.p);
    console.log('run query', {aiPrefix, p});
    const maxChars = 256;
    if (p.length <= maxChars) {
      const prompt = aiPrefix + p + ' */\n';
      const l = parseInt(decodeURIComponent(o.query.l), 10);

      const proxyRes = await _openAiCodex(prompt, {
        stop: '\n/* Command: ',
        temperature: 0,
        top_p: 1,
        max_tokens: l,
      });
      if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
        for (const key in proxyRes.headers) {
          const value = proxyRes.headers[key];
          res.setHeader(key, value);
        }
        // console.log('render');
        proxyRes.pipe(res);
        proxyRes.on('data', d => {
          console.log('got data', d.toString('utf8'));
        });
      } else {
        proxyRes.setEncoding('utf8');
        proxyRes.on('data', s => {
          console.log(s);
        });
        res.setHeader('Content-Type', 'text/event-stream');
        res.end('data: [DONE]');
      }
    } else {
      _respond(400, JSON.stringify({
        error: `prompt length exceeded (max=${maxChars} submitted=${p.length})`,
      }));
    }
  } else if (req.method === 'POST' && p === '/ai21/v1/engines/j1-large/completions') {
    _setCorsHeaders(res);

    const query = await _readJson(req);
    // arrayify since the target api requires an array
    if (typeof query.stop === 'string') {
      query.stop = [query.stop];
    }
    const query2 = {};
    const keyMappings = {
      prompt: 'prompt',
      max_tokens: 'maxTokens',
      temperature: 'temperature',
      top_p: 'topP',
      stop: 'stopSequences',
    };
    for (const k in query) {
      const mapping = keyMappings[k];
      if (mapping) {
        query2[mapping] = query[k];
      }
    }

    // console.log('got ai32 request', {query, query2});

    const proxyRes = await fetch('https://api.ai21.com/studio/v1/j1-large/complete', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.ai21Key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(query2),
    });
    const j = await proxyRes.json();
    // console.log('got ai21 result', j);
    const s = j.completions[0].data.text;
    const result = {
      choices: [
        {
          text: s,
        },
      ],
    };
    res.end(JSON.stringify(result));

    /* proxy.web(req, res, {
      target: `https://api.ai21.com/`,
      // secure: false,
      changeOrigin: true,
    }, err => {
      console.warn(err.stack);

      res.statusCode = 500;
      res.end();
    }); */
  } else if (req.method === 'POST' && p === '/gooseai/v1/engines/gpt-neo-20b/completions') {
    _setCorsHeaders(res);
    
    req.url = '/v1/engines/gpt-neo-20b/completions';
    req.headers['authorization'] = `Bearer ${config.gooseAiKey}`;

    proxy.web(req, res, {
      target: `https://api.goose.ai/`,
      // secure: false,
      changeOrigin: true,
    }, err => {
      console.warn(err.stack);

      res.statusCode = 500;
      res.end();
    });
  } else {
    _respond(403, JSON.stringify({
      error: 'invalid password',
    }));
  }
} catch(err) {
  console.warn(err);

  _respond(500, JSON.stringify({
    error: err.stack,
  }));
}
};

let redisClient = null;
const _tryConnectRedis = () => {
  redisConnect(undefined, cacheHostUrl)
    .then(() => {
      redisClient = getRedisClient();
      console.log('connected to redis');
    })
    .catch(err => {
      console.warn('failed to connect to redis, retrying', err);
      setTimeout(_tryConnectRedis, 1000);
    });
};
_tryConnectRedis();

const proxy = httpProxy.createProxyServer({});
proxy.on('proxyRes', (proxyRes, req) => {
  if (proxyRes.headers['location']) {
    const o = new url.URL(proxyRes.headers['location'], req.url);
    // console.log('redirect location 1', req.url, proxyRes.headers['location'], o.href);
    o.host = o.host.replace('-', '--');
    o.host = o.protocol.slice(0, -1) + '-' + o.host.replace(/\./g, '-').replace(/:([0-9]+)$/, '-$1') + '.proxy.webaverse.com';
    o.protocol = 'https:';
    proxyRes.headers['location'] = o.href;
  }
  proxyRes.headers['access-control-allow-origin'] = '*';
  delete proxyRes.headers['x-frame-options'];
  delete proxyRes.headers['content-security-policy'];
  delete proxyRes.headers['x-xss-protection'];
});
proxy.on('error', err => {
  console.warn(err.stack);
});

const presenceWss = new ws.Server({
  noServer: true,
});
/*presenceWss.on('connection', async (s, req/!*, channels, saveHtml*!/) => {
  const _transaction = tx => {
    s.send(JSON.stringify(tx));
  };
  eventsManager.on('transaction', _transaction);
  s.on('close', () => {
    eventsManager.removeListener('transaction', _transaction);
  });
});*/

const _req = protocol => (req, res) => {
try {

  const o = url.parse(protocol + '//' + (req.headers['host'] || '') + req.url);
  let match;

  if (o.host === 'login.webaverse.com') {
    _handleLogin(req, res);
    return;
  } else if (o.host === 'mainnetsidechain.exokit.org') {
    _handleEthereum(8545)(req, res);
    return;
  } else if (o.host === 'testnetsidechain.exokit.org') {
    _handleEthereum(8546)(req, res);
    return;
  } else if (o.host === 'accounts.webaverse.com' || o.host === 'mainnetsidechain-accounts.webaverse.com') {
    _handleAccounts("mainnetsidechain")(req, res);
    return;
  } else if (o.host === 'testnetsidechain-accounts.webaverse.com') {
    _handleAccounts("testnetsidechain")(req, res);
    return;
  } else if (o.host === 'analytics.webaverse.com') {
    _handleAnalyticsRequest(req, res);
    return;
  } else if (o.host === 'sign.exokit.org') {
    _handleSignRequest(req, res);
    return;
  } else if (o.host === 'unlock.exokit.org') {
    _handleUnlockRequest(req, res);
    return;
  } else if (o.host === 'lock.exokit.org') {
    _handleLockRequest(req, res);
    return;
  } else if (o.host === 'decrypt.exokit.org') {
    _handleDecryptRequest(req, res);
    return;
  } else if (o.host === 'oauth.exokit.org') {
    _handleOauth(req, res);
    return;
  } else if (o.host === 'profile.webaverse.com' || o.host === 'mainnetsidechain-profile.webaverse.com') {
    _handleProfile(true)(req, res);
    return;
  } else if (o.host === 'testnetsidechain-profile.webaverse.com') {
    _handleProfile(false)(req, res);
    return;
  } else if (o.host === 'main.webaverse.com' || o.host === 'test.webaverse.com') {
    _handleProxyRoot(req, res);
    return;
  } else if (o.host === 'main.app.webaverse.com' || o.host === 'test.app.webaverse.com') {
    _handleProxyApp(req, res);
    return;
  } else if (o.host === 'mainnet-tokens.webaverse.com') {
    _handleTokens("mainnet", false)(req, res);
    return;
  } else if (o.host === 'tokensall.webaverse.com' || o.host === 'mainnetall-tokens.webaverse.com') {
    _handleTokens("mainnet", true)(req, res);
    return;
  } else if (o.host === 'tokens.webaverse.com' || o.host === 'mainnetsidechain-tokens.webaverse.com') {
    _handleTokens("mainnetsidechain", false)(req, res);
    return;
  } else if (o.host === 'polygon-tokens.webaverse.com') {
    _handleTokens("polygon", false)(req, res);
    return;
  } else if (o.host === 'tokensall.webaverse.com' || o.host === 'polygonall-tokens.webaverse.com') {
    _handleTokens("polygon", true)(req, res);
    return;
  } else if (o.host === 'testnet-tokens.webaverse.com') {
    _handleTokens("testnet", true)(req, res);
    return;
  } else if (o.host === 'testnetall-tokens.webaverse.com') {
    _handleTokens("testnet", true)(req, res);
    return;
  } else if (o.host === 'testnetpolygon-tokens.webaverse.com') {
    _handleTokens("testnetpolygon", true)(req, res);
    return;
  } else if (o.host === 'testnetpolygonall-tokens.webaverse.com') {
    _handleTokens("testnetpolygon", true)(req, res);
    return;
  } else if (o.host === 'testnetsidechain-tokens.webaverse.com') {
    _handleTokens("testnetsidechain", false)(req, res);
    return;
  } else if (o.host === 'mainnet-land.webaverse.com') {
    _handleLand("mainnet", true)(req, res);
    return;
  } else if (o.host === 'polygon-land.webaverse.com') {
    _handleLand("polygon", true)(req, res);
    return;
  } else if (o.host === 'land.webaverse.com' || o.host === 'mainnetsidechain-land.webaverse.com') {
    _handleLand("mainnetsidechain", false)(req, res);
    return;
  } else if (o.host === 'testnet-land.webaverse.com') {
    _handleLand("testnet", true)(req, res);
    return;
  } else if (o.host === 'testnetsidechain-land.webaverse.com') {
    _handleLand("testnetsidechain", false)(req, res);
    return;
  } else if (o.host === 'testnetpolygon-land.webaverse.com') {
    _handleLand("testnetpolygon", false)(req, res);
    return;
  } else if (o.host === 'graph.webaverse.com') {
    _handleGraph(req, res);
    return;
  /* } else if (o.host === 'worlds.exokit.org') {
    _handleWorldsRequest(req, res);
    return; */
  /* } else if (o.host === 'storage.exokit.org' || o.host === 'storage.webaverse.com') {
    _handleStorageRequest(req, res);
    return; */
  } else if (o.host === 'store.webaverse.com' || o.host === 'mainnetsidechain-store.webaverse.com') {
    _handleStore("mainnet")(req, res);
    return;
  } else if (o.host === 'testnetsidechain-store.webaverse.com') {
    _handleStore("sidechain")(req, res);
    return;
  } else if (o.host === 'ai.exokit.org' || o.host === 'ai.webaverse.com') {
    _handleAi(req, res);
    return;
  }
  
  if (match = o.host.match(/^(.+)\.proxy\.(?:webaverse\.com|exokit\.org)$/)) {
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
        if (o.pathname === '/tokenids' && req.method === 'GET') {
          _handleTokenIds('rinkeby')(req, res);
          return;
        }
        o.protocol = match2[1].replace(/-/g, ':');
        o.host = match2[2].replace(/--/g, '=').replace(/-/g, '.').replace(/=/g, '-').replace(/\.\./g, '-') + (match2[3] ? match2[3].replace(/-/g, ':') : '');
        const oldUrl = req.url;
        req.url = url.format(o);

        // console.log(oldUrl, '->', req.url);

        req.headers['user-agent'] = 'curl/1';
        delete req.headers['origin'];
        delete req.headers['referer'];

        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');

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
    if (match = o.host.match(/^(.+)\.proxy\.(?:webaverse\.com|exokit\.org)$/)) {
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
