require('dotenv').config();
const fs = require('fs');
const url = require('url');
const querystring = require('querystring');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const httpProxy = require('http-proxy');
const ws = require('ws');
const AWS = require('aws-sdk');
const namegen = require('./namegen.js');
const { default: formurlencoded } = require('form-urlencoded');
const bip39 = require('bip39');
const { hdkey } = require('ethereumjs-wallet');
const { getRedisItem, getRedisAllItems, parseRedisItems } = require('./redis.js');
const { makePromise } = require('./utils.js');
const { getStoreEntries, getChainNft, getAllWithdrawsDeposits } = require('./tokens.js');
const { getBlockchain } = require('./blockchain.js');
const { accountKeys, ids, nftIndexName, redisPrefixes, mainnetSignatureMessage, cacheHostUrl } = require('./constants.js');
const { connect: redisConnect, getRedisClient } = require('./redis');

let config = require('fs').existsSync('./config.json') ? require('./config.json') : null;

const { worldManager, _handleWorldsRequest, _startWorldsRoute } = require('./routes/worlds.js');
const { _handleSignRequest } = require('./routes/sign.js');
const { _handleUnlockRequest, _isCollaborator, _isSingleCollaborator } = require('./routes/unlock.js');
const { _handleAnalyticsRequest } = require('./routes/analytics.js');

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
const ses = new AWS.SES(new AWS.Config({
  credentials: new AWS.Credentials({
    accessKeyId,
    secretAccessKey,
  }),
  region: 'us-west-2',
}));

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

(async () => {

  await worldManager.waitForLoad();

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
      const { method } = req;
      const { query, pathname: p } = url.parse(req.url, true);

      console.log('got login', { method, p, query });

      if (method === 'POST') {
        let { email, code, token, discordcode, discordid, twittercode, twitterid, autoip, mnemonic } = query;
        if (email && emailRegex.test(email)) {
          if (token) {
            const tokenItem = await ddb.getItem({
              TableName: tableName,
              Key: {
                email: { S: email + '.token' },
              },
            }).promise();

            console.log('got login', tokenItem, { email, token });

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
                  email: { S: email + '.code' },
                }
              }).promise();

              console.log('got verification', codeItem, { email, code });

              if (codeItem.Item && codeItem.Item.code.S === code) {
                await ddb.deleteItem({
                  TableName: tableName,
                  Key: {
                    email: { S: email + '.code' },
                  }
                }).promise();

                const tokenItem = await ddb.getItem({
                  TableName: tableName,
                  Key: {
                    email: { S: email + '.token' },
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

                await ddb.putItem({
                  TableName: tableName,
                  Item: {
                    email: { S: email + '.token' },
                    name: { S: name },
                    tokens: { S: JSON.stringify(tokens) },
                    mnemonic: { S: mnemonic },
                    address: { S: addr },
                    addr: { S: addr },
                    state: { S: state },
                    stripeState: { S: JSON.stringify(stripeState) },
                    stripeConnectState: { S: JSON.stringify(stripeConnectState) },
                    githubOauthState: { S: JSON.stringify(githubOauthState) },
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
            const code = new Uint32Array(crypto.randomBytes(4).buffer, 0, 1).toString(10).slice(-6);

            console.log('verification', { email, code });

            await ddb.putItem({
              TableName: tableName,
              Item: {
                email: { S: email + '.code' },
                code: { S: code },
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
          }
        } else if (discordcode) {
          if (discordIdTestRegex.test(discordid)) {
            const codeItem = await ddb.getItem({
              TableName: tableName,
              Key: {
                email: { S: discordid + '.code' },
              }
            }).promise();

            console.log('check item', discordid, JSON.stringify(codeItem.Item, null, 2));

            if (codeItem.Item && codeItem.Item.code.S === discordcode) {
              await ddb.deleteItem({
                TableName: tableName,
                Key: {
                  email: { S: discordid + '.code' },
                }
              }).promise();

              // generate
              const tokenItem = await ddb.getItem({
                TableName: tableName,
                Key: {
                  email: { S: discordid + '.discordtoken' },
                },
              }).promise();
              const tokens = (tokenItem.Item && tokenItem.Item.tokens) ? JSON.parse(tokenItem.Item.tokens.S) : [];
              let name = (tokenItem.Item && tokenItem.Item.name) ? tokenItem.Item.name.S : null;
              let mnemonic = (tokenItem.Item && tokenItem.Item.mnemonic) ? tokenItem.Item.mnemonic.S : null;

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
              }

              await ddb.putItem({
                TableName: tableName,
                Item: {
                  email: { S: discordid + '.discordtoken' },
                  mnemonic: { S: mnemonic },
                  // address: {S: addr},
                }
              }).promise();

              // respond
              _setCorsHeaders(res);
              res.end(JSON.stringify({ mnemonic }));
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
                'Content-Type': 'application/x-www-form-urlencoded',
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
              const { access_token } = discordOauthState;

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
                const { id } = j;

                if (id) {
                  const _getUser = async id => {
                    const tokenItem = await ddb.getItem({
                      TableName: tableName,
                      Key: {
                        email: { S: id + '.discordtoken' },
                      }
                    }).promise();

                    let mnemonic = (tokenItem.Item && tokenItem.Item.mnemonic) ? tokenItem.Item.mnemonic.S : null;
                    return { mnemonic };
                  };
                  const _genKey = async id => {
                    const mnemonic = bip39.generateMnemonic();
                    const wallet = hdkey.fromMasterSeed(bip39.mnemonicToSeedSync(mnemonic)).derivePath(`m/44'/60'/0'/0/0`).getWallet();
                    const address = wallet.getAddressString();

                    await ddb.putItem({
                      TableName: tableName,
                      Item: {
                        email: { S: id + '.discordtoken' },
                        mnemonic: { S: mnemonic },
                        address: { S: address },
                      }
                    }).promise();
                    return { mnemonic };
                  };

                  const user = await _getUser(id) || _genKey(id);
                  const { mnemonic } = user;

                  _setCorsHeaders(res);
                  res.end(JSON.stringify({ mnemonic }));
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
                email: { S: twitterid + '.code' },
              }
            }).promise();

            console.log('check item', twitterid, JSON.stringify(codeItem.Item, null, 2));

            if (codeItem.Item && codeItem.Item.code.S === twittercode) {
              await ddb.deleteItem({
                TableName: tableName,
                Key: {
                  email: { S: twitterid + '.code' },
                }
              }).promise();

              // generate
              const tokenItem = await ddb.getItem({
                TableName: tableName,
                Key: {
                  email: { S: twitterid + '.twittertoken' },
                },
              }).promise();
              const tokens = (tokenItem.Item && tokenItem.Item.tokens) ? JSON.parse(tokenItem.Item.tokens.S) : [];
              let name = (tokenItem.Item && tokenItem.Item.name) ? tokenItem.Item.name.S : null;
              let mnemonic = (tokenItem.Item && tokenItem.Item.mnemonic) ? tokenItem.Item.mnemonic.S : null;

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
              }

              await ddb.putItem({
                TableName: tableName,
                Item: {
                  email: { S: twitterid + '.twittertoken' },
                  mnemonic: { S: mnemonic },
                }
              }).promise();

              // respond
              _setCorsHeaders(res);
              res.end(JSON.stringify({ mnemonic }));
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
                email: { S: ip + '.ipcode' },
                mnemonic: { S: mnemonic },
                timeout: { N: (Date.now() + 60 * 1000) + '' },
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
                email: { S: ip + '.ipcode' },
              }
            }).promise();

            console.log('check item', ip, JSON.stringify(codeItem.Item, null, 2));

            if (codeItem.Item && codeItem.Item.mnemonic.S && Date.now() < +new Date(parseInt(codeItem.Item.timeout.N))) {
              await ddb.deleteItem({
                TableName: tableName,
                Key: {
                  email: { S: ip + '.ipcode' },
                }
              }).promise();

              const mnemonic = codeItem.Item.mnemonic.S;

              _setCorsHeaders(res);
              res.end(JSON.stringify({ mnemonic }));
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
    } catch (err) {
      console.warn(err);

      _respond(500, JSON.stringify({
        error: err.stack,
      }));
    }
  };

  const _handleEthereum = port => async (req, res) => { // XXX make this per-port
    const _respond = (statusCode, body) => {
      res.statusCode = statusCode;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(body);
    };

    try {
      const { method } = req;
      const { query, pathname: p } = url.parse(req.url, true);

      const {
        gethNodeUrl,
      } = await getBlockchain();

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
    } catch (err) {
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
      const { method } = req;
      let { pathname: p } = url.parse(req.url);

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
    } catch (err) {
      console.warn(err);

      _respond(500, JSON.stringify({
        error: err.stack,
      }));
    }
  };

  const _handleOauth = async (req, res) => {
    const _respond = (statusCode, body) => {
      res.statusCode = statusCode;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Access-Control-Allow-Methods', '*');
      res.end(body);
    };

    try {
      const { method } = req;
      const o = url.parse(req.url, true);
      if (method === 'GET' && o.pathname === '/github') {
        const { state, code } = o.query;
        console.log('handle github oauth', { state, code });
        const match = state ? state.match(/^(.+?):(.+?):(.+?)$/) : null;
        if (match && code) {
          const email = match[1];
          const token = match[2];
          const redirect = match[3];

          const tokenItem = await ddb.getItem({
            TableName: tableName,
            Key: {
              email: { S: email + '.token' },
            }
          }).promise();

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
                  email: { S: tokenItem.Item.email.S },
                  name: { S: tokenItem.Item.name.S },
                  tokens: { S: tokenItem.Item.tokens.S },
                  state: { S: tokenItem.Item.state.S },
                  stripeState: { S: tokenItem.Item.stripeState.S },
                  stripeConnectState: { S: tokenItem.Item.stripeConnectState.S },
                  githubOauthState: { S: JSON.stringify(githubOauthState) },
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
      const { method } = req;

      if (method === 'GET') {
        const { pathname: p } = url.parse(req.url, true);
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
            if (!tokens2.some(token2 => token2.properties.hash === token.properties.hash)) {
              tokens2.push(token);
            }
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
    } catch (err) {
      console.warn(err);

      _respond(500, JSON.stringify({
        error: err.stack,
      }));
    }
  };

  const _handleProxyRoot = (() => {
    const proxy = httpProxy.createProxyServer({});
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
  const _handleCachedNft = contractName => (chainName, isAll) => async (req, res) => {
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
      const { method } = req;

      if (method === 'GET') {
        const { pathname: p } = url.parse(req.url, true);
        let match;
        if (match = p.match(/^\/([0-9]+)$/)) {
          const tokenId = parseInt(match[1], 10);

          let o = await getRedisItem(tokenId, redisPrefixes.mainnetsidechainNft);
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
                if (token.properties.hash === "" && token.owner.address === "0x0000000000000000000000000000000000000000") {
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
          tokens.sort((a, b) => a.id - b.id);
          if (contractName === 'NFT') {
            tokens = tokens.filter((token, i) => { // filter unique hashes
              if (token === "0" || (token.properties.hash === "" && token.owner.address === "0x0000000000000000000000000000000000000000")) {
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
          const { q = '*', ext, owner, minter } = qs;
          if (q) {
            const regex = /(\w+)/g;
            const words = [];
            let match;
            while (match = regex.exec(q)) {
              words.push(`%${match[1]}%`);
            }

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
        } else {
          _respond(404, 'not found');
        }
      } else {
        _respond(404, 'not found');
      }
    } catch (err) {
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
      const { method } = req;

      if (method === 'GET') {
        const { pathname: p } = url.parse(req.url, true);
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
                if (token.properties.hash === "" && token.owner.address === "0x0000000000000000000000000000000000000000") {
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
              if (token === "0" || (token.properties.hash === "" && token.owner.address === "0x0000000000000000000000000000000000000000")) {
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
    } catch (err) {
      console.warn(err);

      _respond(500, JSON.stringify({
        error: err.stack,
      }));
    }
  };
  const _handleTokens = _handleCachedNft('NFT');
  const _handleLand = _handleChainNft('LAND');

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
      const { method } = req;
      const { pathname: p } = url.parse(req.url);

      const _getBooths = async () => {
        const storeEntries = await getStoreEntries(chainName);

        const booths = [];
        for (let i = 0; i < storeEntries.length; i++) {
          const store = storeEntries[i]
          const { tokenId, seller } = store;

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
    } catch (err) {
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
      } else if (o.host === 'worlds.exokit.org') {
        _handleWorldsRequest(req, res);
        return;
      } else if (o.host === 'store.webaverse.com' || o.host === 'mainnetsidechain-store.webaverse.com') {
        _handleStore("mainnet")(req, res);
        return;
      } else if (o.host === 'testnetsidechain-store.webaverse.com') {
        _handleStore("sidechain")(req, res);
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
    } catch (err) {
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
    } else {
      const o = url.parse(protocol + '//' + (req.headers['host'] || '') + req.url);
      console.log('got', protocol, req.headers['host'], req.url, o);
      let match;
      if (match = o.host.match(/^(.+)\.proxy\.exokit.org$/)) {
        const raw = match[1];
        const match2 = raw.match(/^(https?-)(.+?)(-[0-9]+)?$/);
        console.log('match 2', raw, match2);
        if (match2) {
          const hostname = match2[2].replace(/--/g, '=').replace(/-/g, '.').replace(/=/g, '-').replace(/\.\./g, '-') + (match2[3] ? match2[3].replace(/-/g, ':') : '');
          const host = 'wss://' + hostname;
          req.headers['host'] = hostname;
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