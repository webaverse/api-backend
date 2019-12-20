const path = require('path');
const stream = require('stream');
const fs = require('fs');
const url = require('url');
const querystring = require('querystring');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const mkdirp = require('mkdirp');
const httpProxy = require('http-proxy');
const ws = require('ws');
const LRU = require('lru');
const request = require('request');
const AWS = require('aws-sdk');
const Stripe = require('stripe');
// const puppeteer = require('puppeteer');
const namegen = require('./namegen.js');
const Base64Encoder = require('./encoder.js').Encoder;
const {HTMLServer, CustomEvent} = require('./sync-server.js');
const {SHA3} = require('sha3');
const {accessKeyId, secretAccessKey, /*githubUsername, githubApiKey,*/ githubPagesDomain, githubClientId, githubClientSecret} = require('./config.json');
const awsConfig = new AWS.Config({
  credentials: new AWS.Credentials({
    accessKeyId,
    secretAccessKey,
  }),
  region: 'us-west-1',
});
const ddb = new AWS.DynamoDB(awsConfig);
const s3 = new AWS.S3(awsConfig);
const ses = new AWS.SES(new AWS.Config({
  credentials: new AWS.Credentials({
    accessKeyId,
    secretAccessKey,
  }),
  region: 'us-west-2',
}));
const apiKeyCache = new LRU({
  max: 1024,
  maxAge: 60 * 1000,
});
const client_id = 'ca_Bj6O5x5CFVCOELBhyjbiJxwUfW6l8ozd';
const client_secret = 'sk_test_WMysffATw60L1FhYxKDphPgO';
const stripe = Stripe(client_secret);

const Discord = require('discord.js');

const bip32 = require('./bip32.js');
const bip39 = require('./bip39.js');
const ethUtil = require('./ethereumjs-util.js');
const api = require('./api.js');

const CERT = fs.readFileSync('./cert/fullchain.pem');
const PRIVKEY = fs.readFileSync('./cert/privkey.pem');

const PORT = parseInt(process.env.PORT, 10) || 80;
const PARCEL_SIZE = 8;
const maxChunkSize = 25*1024*1024;
const filterTopic = 'webxr-site';

const bucketNames = {
  content: 'content.exokit.org',
  channels: 'channels.exokit.org',
  rooms: 'rooms.exokit.org',
};
const channels = {};
const gridChannels = {};

const emailRegex = /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/;
const codeTestRegex = /^[0-9]{6}$/;
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
function _getParcelKey(x, y) {
  return [x, y].join(':');
}
function _getKey(x, z) {
  return [Math.floor(x/PARCEL_SIZE), Math.floor(z/PARCEL_SIZE)];
}
function _getKeyFromBindingUrl(u) {
  const match = u.match(/^\/\?c=(-?[0-9\.]+),(-?[0-9\.]+)$/);
  if (match) {
    const x = parseFloat(match[1]);
    const z = parseFloat(match[2]);
    if (isFinite(x) && isFinite(z)) {
      return _getKey(x, z);
    } else {
      return [];
    }
  } else {
    return [];
  }
}
const _makePromise = () => {
  let accept, reject;
  const p = new Promise((a, r) => {
    accept = a;
    reject = r;
  });
  p.accept = accept;
  p.reject = reject;
  return p;
};

(async () => {

const _handleLogin = async (req, res) => {
  const _respond = (statusCode, body) => {
    res.statusCode = statusCode;
    res.setHeader('Access-Control-Allow-Origin', '*');
    // res.setHeader('Access-Control-Allow-Headers', '*');
    // res.setHeader('Access-Control-Allow-Methods', '*');
    res.end(body);
  };

try {
    const {method} = req;
    const {query, pathname: p} = url.parse(req.url, true);

    console.log('got login', {method, p, query});

    if (method === 'POST') {
      let {email, code, token} = query;
      if (email && emailRegex.test(email)) {
        if (token) {
          const tokenItem = await ddb.getItem({
            TableName: 'login',
            Key: {
              email: {S: email + '.token'},
            }
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
              TableName: 'login',
              Key: {
                email: {S: email + '.code'},
              }
            }).promise();
            
            console.log('got verification', codeItem, {email, code});
            
            if (codeItem.Item && codeItem.Item.code.S === code) {
              await ddb.deleteItem({
                TableName: 'login',
                Key: {
                  email: {S: email + '.code'},
                }
              }).promise();
              
              const tokenItem = await ddb.getItem({
                TableName: 'login',
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
              if (!mnemonic) {
                mnemonic = bip39.entropyToMnemonic(crypto.randomBytes(32));
              }
              if (!addr) {
                const start = Date.now();
                const seed = bip39.mnemonicToSeedSync(mnemonic, '');
                const privateKey = '0x' + bip32.fromSeed(seed).derivePath("m/44'/60'/0'/0").derive(0).privateKey.toString('hex');
                addr = '0x' + ethUtil.privateToAddress(privateKey).toString('hex');
                const end = Date.now();
                console.log('get address time', end - start, addr);
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
                TableName: 'login',
                Item: {
                  email: {S: email + '.token'},
                  name: {S: name},
                  tokens: {S: JSON.stringify(tokens)},
                  mnemonic: {S: mnemonic},
                  addr: {S: addr},
                  state: {S: state},
                  stripeState: {S: JSON.stringify(stripeState)},
                  stripeConnectState: {S: JSON.stringify(stripeConnectState)},
                  githubOauthState: {S: JSON.stringify(githubOauthState)},
                  whitelisted: {BOOL: true},
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
          const tokenItem = await ddb.getItem({
            TableName: 'login',
            Key: {
              email: {S: email + '.token'},
            }
          }).promise();
          const whitelisted = tokenItem.Item ? tokenItem.Item.whitelisted.BOOL : false;
          console.log('whitelist', {email, whitelisted});

          if (whitelisted) {
            const code = new Uint32Array(crypto.randomBytes(4).buffer, 0, 1).toString(10).slice(-6);
            
            console.log('verification', {email, code});

            await ddb.putItem({
              TableName: 'login',
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
                            Data: `<h1>${code}</h1><h2><a href="https://browser.exokit.org/?email=${encodeURIComponent(email)}&code=${encodeURIComponent(code)}">Log in</a></h2>`
                        }
                    },
                    
                    Subject: {
                        Data: `Verification code for Exokit`
                    }
                },
                Source: "noreply@exokit.org"
            };
        
            
            const data = await ses.sendEmail(params).promise();
            
            console.log('got response', data);
            
            _respond(200, JSON.stringify({}));
          } else {
            _respond(403, JSON.stringify({
              error: 'email not whitelisted',
            }));
          }
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

const _handlePresence = async (req, res, channels) => {
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
  console.log('presence request', {method, p});

  if (method === 'GET') {
    let match;
    if (p === '/channels') {
      _respond(200, JSON.stringify(Object.keys(channels)));
    } else if (match = p.match(/^\/channels\/([^\/]+)$/)) {
      const channelName = match[1];
      const channel = channels[channelName];
      if (channel) {
        const html = channel.htmlServer.getHtml();
        res.end(html);
      } else {
        _respond(404, JSON.stringify({
          error: 'not found',
        }));
      }
    /* } else if (match = p.match(/^\/channels\/([^\/]+)\/([^\/]+)$/)) {
      const channelName = match[1];
      const fileName = match[2];
      const channel = channels[channelName];
      if (channel) {
        const bs = channel.files[fileName];
        if (bs) {
          _setCorsHeaders(res);
          for (let i = 0; i < bs.length; i++) {
            res.write(bs[i]);
          }
          res.end();
        } else {
          _respond(404, JSON.stringify({
            error: 'not found',
          }));
        }
      } else {
        _respond(404, JSON.stringify({
          error: 'not found',
        }));
      } */
    } else {
      _respond(404, JSON.stringify({
        error: 'not found',
      }));
    }
  /* } else if (method === 'PUT') {
    const match = p.match(/^\/channels\/([^\/]+)\/([^\/]+)$/);
    if (match) {
      const channelName = match[1];
      const fileName = match[2];
      const channel = channels[channelName];
      console.log('match channel', channelName, fileName, !!channel)
      if (channel) {
        await channel.upload(fileName, req);

        _respond(200, JSON.stringify({
          url: `https://presence.exokit.org/channels/${channelName}/${fileName}`,
        }));
      } else {
        _respond(404, JSON.stringify({
          error: 'not found',
        }));
      }
    } else {
      _respond(404, JSON.stringify({
        error: 'not found',
      }));
    } */
  } else if (method === 'OPTIONS') {
    // console.log('respond options');

    _respond(200, JSON.stringify({}));
  } else {
    _respond(404, JSON.stringify({
      error: 'not found',
    }));
  }
} catch(err) {
  console.warn(err);

  _respond(500, JSON.stringify({
    error: err.stack,
  }));
}
};

const _fetchPrefix = prefix => {
  // console.log('got prefix', prefix);
  return s3.listObjects({
    Bucket: bucketNames.content,
    Delimiter: '/',
    Prefix: prefix,
  }).promise();
};
const _fetchRecursive = async prefix => {
  const results = [];
  const _recurse = async p => {
    const o = await _fetchPrefix(p);
    const {Contents, CommonPrefixes} = o;

    for (let i = 0; i < Contents.length; i++) {
      const o = Contents[i];
      const k = o.Key
        // .replace(/^users\/[^\/]*?\//, '')
        // .replace(/^([^\/]*?\/)[^\/]*?\//, '$1');
      // console.log('push key', [p, k]);
      results.push(k);
    }

    for (let i = 0; i < CommonPrefixes.length; i++) {
      // console.log('check common', [p, CommonPrefixes[i].Prefix]);
      await _recurse(CommonPrefixes[i].Prefix);
    }
  };
  await _recurse(prefix);
  return results;
};
const _handleUpload = async (req, res, userName, channelName) => {
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

  if (method === 'OPTIONS') {
    // res.statusCode = 200;
    _setCorsHeaders(res);
    res.end();
  } else {
    const o = url.parse(req.url, true);
    let match;
    if (match = o.pathname.match(/^\/(?:([^\/]+)(?:\/([^\/]+))?)?$/)) {
      const username = match[1];
      const filename = match[2];

      /* if (method === 'GET' && !username && !filename) {
        const objects = await s3.listObjects({
          Bucket: bucketNames.content,
          Delimiter: '/',
          Prefix: 'users/',
        }).promise();
        // const keys = objects.Contents.map(o => o.Key);
        const keys = objects.Contents.map(o => o.Key.replace(/^users\//, '').replace(/^([^\/]*?\/)[^\/]*?\//, '$1'));

        console.log('got contents', objects);

        _respond(200, JSON.stringify(keys));
      } else */if (method === 'GET' && username && !filename) {
        let keys = await _fetchRecursive(`users/${username}/`);
        keys = keys.map(k => k.replace(/^users\/[^\/]*?\//, ''));

        _respond(200, JSON.stringify(keys));

        /* const objects = await s3.listObjects({
          Bucket: bucketNames.content,
          Delimiter: '/',
          Prefix: `${username}/`,
        }).promise();

        const result = [];
        for (let i = 0; i < objects.Contents.length; i++) {
          const o = objects.Contents[i];
          const key = o.Key;
          const m = await s3.headObject({
            Bucket: bucketNames.content,
            Key: key,
          }).promise();
          result.push({
            filename: key,
            contentType: m.ContentType,
            metadata: m.Metadata,
          });
        }

        _respond(200, JSON.stringify(result)); */
      } else if (method === 'GET' && username && filename) {
        res.statusCode = 301;
        res.setHeader('Location', `https://content.exokit.org/${username}/${filename}`);
        _setCorsHeaders(res);
        res.end();
      } else if (method == 'POST' && username && filename) {
        console.log('got inventory req', o);
        if (o.query.email && o.query.token) {
          let {email, token} = o.query;
          const tokenItem = await ddb.getItem({
            TableName: 'login',
            Key: {
              email: {S: email + '.token'},
            }
          }).promise();

          // console.log('got item', JSON.stringify(token), tokenItem && tokenItem.Item);

          const tokens = tokenItem.Item ? JSON.parse(tokenItem.Item.tokens.S) : [];
          if (tokens.includes(token)) {
            const loginUsername = tokenItem.Item.name.S;

            if (username === loginUsername) {
              const key = username + '/' + filename;
              const contentType = req.headers['content-type'] || 'application/octet-stream';
              const signedUploadUrl = s3.getSignedUrl('putObject', {
                Bucket: bucketNames.content,
                Key: key,
                ContentType: contentType,
                Expires: 5*60,
              });
              _respond(200, signedUploadUrl);
            } else {
              _respond(403, 'forbidden');
            }
          } else {
            _respond(401, 'not authorized');
          }
        } else {
          _respond(401, 'not authorized');
        }
      } else {
        _respond(404, 'not found');
      }
    } else {
      _respond(404, 'not found');
    }
  }
} catch(err) {
  console.warn(err);

  _respond(500, JSON.stringify({
    error: err.stack,
  }));
}
};

const _getKeypath = s => s.split('/');
const _findKeypath = (root, keypath) => {
  const _recurse = (node, i) => {
    if (i < keypath.length) {
      const nextName = keypath[i];
      const child = node.children ? node.children.find(c => c.name === nextName) : undefined;
      if (child) {
        return _recurse(child, i + 1);
      } else {
        return null;
      }
    } else {
      return node;
    }
  };
  return _recurse(root, 0);
};
const _setFile = (root, keypath, hash) => {
  const d = _mkdirp(root, keypath.slice(0, -1));
  const fileName = keypath[keypath.length - 1];
  let fileNode = d.children.find(node => node.name === fileName);
  if (!fileNode) {
    fileNode = {
      name: fileName,
      hash: '',
    };
    d.children.push(fileNode);
  }
  fileNode.hash = hash;
  // console.log('made dir 2', JSON.stringify(root), JSON.stringify(d), JSON.stringify(fileNode));
  return root;
};
const _mkdirp = (root, keypath) => {
  const _recurse = (node, i) => {
    if (i < keypath.length) {
      const nextName = keypath[i];
      let child = node.children ? node.children.find(c => c.name === nextName && c.children) : undefined;
      if (!child) {
        child = {
          name: nextName,
          children: [],
        };
        node.children.push(child);
      }
      return _recurse(child, i + 1);
    } else {
      return node;
    }
  };
  return _recurse(root, 0);
};
const _handleHashes = async (req, res, userName, channelName) => {
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

  if (method === 'OPTIONS') {
    // res.statusCode = 200;
    _setCorsHeaders(res);
    res.end();
  } else {
    const o = url.parse(req.url, true);
    let match;
    if (match = o.pathname.match(/^\/(?:([^\/]+)(?:\/([^\/]+))?)?$/)) {
      const username = match[1];
      const filename = match[2];

      if (method == 'PUT' && username && filename) {
        // console.log('got inventory req', o);

        if (o.query.email && o.query.token) {
          let {email, token} = o.query;
          const tokenItem = await ddb.getItem({
            TableName: 'login',
            Key: {
              email: {S: email + '.token'},
            }
          }).promise();

          // console.log('got item', JSON.stringify(token), tokenItem && tokenItem.Item);

          const tokens = tokenItem.Item ? JSON.parse(tokenItem.Item.tokens.S) : [];
          if (tokens.includes(token)) {
            const loginUsername = tokenItem.Item.name.S;

            if (username === loginUsername) {
              const s = new stream.PassThrough();
              let contentLength = 0;
              const hash = new SHA3(256);
              await new Promise((accept, reject) => {
                req.on('data', d => {
                  s.write(d);
                  contentLength += d.byteLength;
                  hash.update(d);
                });
                req.on('end', () => {
                  s.end();
                  accept();
                });
                req.on('error', reject);
              });
              const key = username + '/' + filename;
              const contentType = req.headers['content-type'] || 'application/octet-stream';
              const h = hash.digest('hex');
              const metadata = {
                filename: key,
                hash: h,
              };
              await s3.putObject({
                Bucket: bucketNames.content,
                Key: `hash/${h}`,
                ContentType: contentType,
                ContentLength: contentLength,
                Body: s,
                Metadata: metadata,
              }).promise(); 

              const o = await (async () => {
                try {
                  return await s3.getObject({
                    Bucket: bucketNames.content,
                    Key: `users/${username}`,
                  }).promise();
                } catch(err) {
                  // console.warn(err);
                  return null;
                }
              })();

              const root = (o && o.Body) ? JSON.parse(o.Body) : {
                name: '',
                children: [],
              };
              _setFile(root, _getKeypath(key), h);
              await s3.putObject({
                Bucket: bucketNames.content,
                Key: `users/${username}`,
                ContentType: 'application/json',
                Body: JSON.stringify(root),
              }).promise();
              
              _respond(200, JSON.stringify({ok: true}));
            } else {
              _respond(403, 'forbidden');
            }
          } else {
            _respond(401, 'not authorized');
          }
        } else {
          _respond(401, 'not authorized');
        }
      } else {
        _respond(404, 'not found');
      }
    } else {
      _respond(404, 'not found');
    }
  }
} catch(err) {
  console.warn(err);

  _respond(500, JSON.stringify({
    error: err.stack,
  }));
}
};

const _handlePreview = async (req, res, userName, channelName) => {
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

  if (method === 'OPTIONS') {
    // res.statusCode = 200;
    _setCorsHeaders(res);
    res.end();
  } else {
    const o = url.parse(req.url, true);
    let match;
    if (match = o.pathname.match(/^\/(?:([^\/]+)(?:\/([^\/]+))?)?$/)) {
      const username = match[1];
      const filename = match[2];

      if (method == 'PUT' && username && filename) {
        // console.log('got inventory req', o);

        if (o.query.email && o.query.token) {
          let {email, token} = o.query;
          const tokenItem = await ddb.getItem({
            TableName: 'login',
            Key: {
              email: {S: email + '.token'},
            }
          }).promise();

          // console.log('got item', JSON.stringify(token), tokenItem && tokenItem.Item);

          const tokens = tokenItem.Item ? JSON.parse(tokenItem.Item.tokens.S) : [];
          if (tokens.includes(token)) {
            const loginUsername = tokenItem.Item.name.S;

            if (username === loginUsername) {
              const key = username + '/' + filename;
              const o = await s3.getObject({
                Bucket: bucketNames.content,
                Key: `url/${key}`,
              }).promise();
              // console.log('got old metadata', `url/${key}`, o);
              const metadata = o.Metadata;
              const {hash: h} = metadata;

              const s = new stream.PassThrough();
              let contentLength = 0;
              await new Promise((accept, reject) => {
                req.on('data', d => {
                  s.write(d);
                  contentLength += d.byteLength;
                });
                req.on('end', () => {
                  s.end();
                  accept();
                });
                req.on('error', reject);
              });
              // console.log('save screenshot', `preview/${h}`);
              await s3.putObject({
                Bucket: bucketNames.content,
                Key: `preview/${h}`,
                ContentType: 'image/png',
                ContentLength: contentLength,
                Body: s,
              }).promise();
              
              _respond(200, JSON.stringify(metadata));
            } else {
              _respond(403, 'forbidden');
            }
          } else {
            _respond(401, 'not authorized');
          }
        } else {
          _respond(401, 'not authorized');
        }
      } else {
        _respond(404, 'not found');
      }
    } else {
      _respond(404, 'not found');
    }
  }
} catch(err) {
  console.warn(err);

  _respond(500, JSON.stringify({
    error: err.stack,
  }));
}
};

const parcels = {};
const _handleGrid = async (req, res, userName, channelName) => {
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
  const _readJson = () => new Promise((accept, reject) => {
    const bs = [];
    req.on('data', b => {
      bs.push(b);
    });
    req.on('end', () => {
      const b = Buffer.concat(bs);
      const s = b.toString('utf8');
      try {
        accept(JSON.parse(s));
      } catch(err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });

try {
  const {method} = req;

  if (method === 'GET') {
    const o = url.parse(req.url, true);
    let match, x, y;
    if ((match = o.pathname.match(/^\/parcels\/(-?[0-9]+)\/(-?[0-9]+)$/)) && !isNaN(x = parseInt(match[1], 10)) && !isNaN(y = parseInt(match[2], 10))) {
      const key = _getParcelKey(x, y);
      const parcel = parcels[key];
      if (parcel) {
        _respond(200, JSON.stringify(parcel));
      } else {
        _respond(200, JSON.stringify(null));
      }
    } else {
      _respond(404, 'not found');
    }
  } else if (method === 'POST') {
    const o = url.parse(req.url, true);
    let match, x, y;
    if (o.pathname === '/parcels') {
      const j = await _readJson();
      if (
        j && typeof j === 'object' && Array.isArray(j.coords) && j.coords.every(c =>
          Array.isArray(c) && c.length === 2 && c.every(e => typeof e === 'number')
        ) && /*typeof j.name === 'string' &&*/ typeof j.html === 'string'
      ) {
        const parcelKeys = [];
        for (let i = 0; i < j.coords.length; i++) {
          const coord = j.coords[i];
          const [x, y] = coord;
          parcelKeys.push(_getParcelKey(x, y));
        }
        if (parcelKeys.every(key => !parcels[key]) /*&& Object.keys(parcels).every(key => parcels[key].name !== j.name)*/) {
          const parcel = {
            // name: j.name,
            coords: j.coords,
            html: j.html,
          };
          for (let i = 0; i < parcelKeys.length; i++) {
            parcels[parcelKeys[i]] = parcel;
          }
          _respond(200, JSON.stringify({ok: true}));
        } else {
          _respond(409, 'conflict');
        }
      } else {
        _respond(400, 'invalid data');
      }
    } else if ((match = o.pathname.match(/^\/parcels\/(-?[0-9]+)\/(-?[0-9]+)$/)) && !isNaN(x = parseInt(match[1], 10)) && !isNaN(y = parseInt(match[2], 10))) {
      const j = await _readJson();
      if (
        j && typeof j === 'object' && Array.isArray(j.coords) && j.coords.every(c =>
          Array.isArray(c) && c.length === 2 && c.every(e => typeof e === 'number')
        ) && /*typeof j.name === 'string' &&*/ typeof j.html === 'string'
      ) {
        const key = _getParcelKey(x, y);
        const parcel = parcels[key];
        if (parcel) {
          const oldParcelKeys = [];
          for (let i = 0; i < parcel.coords.length; i++) {
            const coord = parcel.coords[i];
            const [x, y] = coord;
            oldParcelKeys.push(_getParcelKey(x, y));
          }

          const parcelKeys = [];
          for (let i = 0; i < j.coords.length; i++) {
            const coord = j.coords[i];
            const [x, y] = coord;
            parcelKeys.push(_getParcelKey(x, y));
          }
          if (parcelKeys.every(key => !parcels[key] || oldParcelKeys.includes(key)) /*&& Object.keys(parcels).every(key => parcels[key].name !== j.name || oldParcelKeys.includes(key))*/) {
            for (let i = 0; i < oldParcelKeys.length; i++) {
              delete parcels[oldParcelKeys[i]];
            }
            const parcel = {
              // name: j.name,
              coords: j.coords,
              html: j.html,
            };
            for (let i = 0; i < parcelKeys.length; i++) {
              parcels[parcelKeys[i]] = parcel;
            }
            _respond(200, JSON.stringify({ok: true}));
          } else {
            _respond(409, 'conflict');
          }
        } else {
          _respond(404, 'not found');
        }
      } else {
        _respond(400, 'invalid data');
      }
    } else {
      _respond(404, 'not found');
    }
  } else if (method === 'DELETE') {
    const o = url.parse(req.url, true);
    let match, x, y;
    if ((match = o.pathname.match(/^\/parcels\/(-?[0-9]+)\/(-?[0-9]+)$/)) && !isNaN(x = parseInt(match[1], 10)) && !isNaN(y = parseInt(match[2], 10))) {
      const key = _getParcelKey(x, y);
      const parcel = parcels[key];
      if (parcel) {
        for (let i = 0; i < parcel.coords.length; i++) {
          const coord = parcel.coords[i];
          const [x, y] = coord;
          const key = _getParcelKey(x, y);
          delete parcels[key];
        }
        _respond(200, JSON.stringify({ok: true}));
      } else {
        _respond(404, 'not found');
      }
    } else {
      _respond(404, 'not found');
    }
  } else if (method === 'OPTIONS') {
    _respond(200, JSON.stringify({}));
  } else {
    _respond(404, 'not found');
  }
} catch (err) {
  console.warn(err.stack);
}
};

/* const _handleRaw = async (req, res, userName, channelName) => {
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

  if (method === 'OPTIONS') {
    // res.statusCode = 200;
    _setCorsHeaders(res);
    res.end();
  } else if (method === 'GET') {
    const o = url.parse(req.url);
    const f = path.join(__dirname, 'glb', o.pathname);

    const rs = fs.createReadStream(f);
    rs.pipe(res);
    rs.on('error', err => {
      if (err.code === 'ENOENT') {
        _respond(404, err.stack);
      } else {
        _respond(500, err.stack);
      }
    });
  } else if (method === 'PUT') {
    const o = url.parse(req.url);
    const f = path.join(__dirname, 'glb', o.pathname);
    const d = path.dirname(f);
    mkdirp(d, err => {
      if (!err) {
        const ws = req.pipe(fs.createWriteStream(f));
        ws.on('finish', () => {
          _respond(200, JSON.stringify({ok: true}));
        });
        ws.on('error', err => {
          _respond(500, err.stack);
        });
      } else {
        _respond(500, err.stack);
      }
    });
  } else {
    _respond(404, 'not found');
  }
} catch(err) {
  console.warn(err);

  _respond(500, JSON.stringify({
    error: err.stack,
  }));
}
}; */

/* const _handleSites = async (req, res, userName, channelName) => {
  const _respond = (statusCode, body) => {
    res.statusCode = statusCode;
    res.setHeader('Access-Control-Allow-Origin', '*');
    // res.setHeader('Access-Control-Allow-Headers', '*');
    // res.setHeader('Access-Control-Allow-Methods', '*');
    res.end(body);
  };

try {
  const {method} = req;
  console.log('sites request', {method, userName, channelName});

  if (method === 'GET') {
    console.log('sites get request', {method});

    const k = `${userName}/${channelName}`;
    const htmlStringRes = await s3.getObject({
      Bucket: bucketNames.channels,
      Key: k,
    }).promise().catch(async err => {
      if (err.code === 'NoSuchKey') {
        return null;
      } else {
        throw err;
      }
    });
    if (htmlStringRes) {
      res.setHeader('Content-Type', 'text/html');
      let s = `<!doctype html>\n<html>\n<head>\n<script src="https://web.exokit.org/ew.js" type=module></script>\n</head>\n<body>\n<xr-engine>\n`;
      s += htmlStringRes.Body.toString('utf8');
      s += `\n</xr-engine>\n</body>\n</html>\n`;
      _respond(200, s);
    } else {
      _respond(404, '');
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
}; */

const _handleInventory = async (req, res) => {
  const _respond = (statusCode, body) => {
    res.statusCode = statusCode;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
    res.end(body);
  };

try {
  const o = url.parse(req.url, true);
  console.log('got inventory req', o);
  if (o.pathname === '/' && o.query.email && o.query.token) {
    let {email, token} = o.query;
    const tokenItem = await ddb.getItem({
      TableName: 'login',
      Key: {
        email: {S: email + '.token'},
      }
    }).promise();

    // console.log('got item', JSON.stringify(token), tokenItem && tokenItem.Item);

    const tokens = tokenItem.Item ? JSON.parse(tokenItem.Item.tokens.S) : [];
    if (tokens.includes(token)) {
      const inventoryItem = await ddb.getItem({
        TableName: 'inventory',
        Key: {
          email: {S: email},
        }
      }).promise();

      const inventory = inventoryItem.Item ? JSON.parse(inventoryItem.Item.inventory.S) : [];

      _respond(200, JSON.stringify(inventory));
    } else {
      _respond(401, 'not authorized');
    }
  } else if (o.pathname === '/add' && o.query.email && o.query.token && o.query.src && o.query.name) {
    let {email, token, src, name} = o.query;
    const tokenItem = await ddb.getItem({
      TableName: 'login',
      Key: {
        email: {S: email + '.token'},
      }
    }).promise();

    // console.log('got item', JSON.stringify(token), tokenItem && tokenItem.Item);

    const tokens = tokenItem.Item ? JSON.parse(tokenItem.Item.tokens.S) : [];
    if (tokens.includes(token)) {
      const inventoryItem = await ddb.getItem({
        TableName: 'inventory',
        Key: {
          email: {S: email},
        }
      }).promise();

      const inventory = inventoryItem.Item ? JSON.parse(inventoryItem.Item.inventory.S) : [];
      const item = inventory.find(item => item.src === src);
      if (index !== -1) {
        item.src = src;
        item.name = name;
      } else {
        inventory.push({
          src,
          name,
        });
      }

      await ddb.putItem({
        TableName: 'inventory',
        Item: {
          email: {S: email},
          inventory: {S: JSON.stringify(inventory)},
        }
      }).promise();

      _respond(200, JSON.stringify(inventory));
    } else {
      _respond(401, 'not authorized');
    }
  } else if (o.pathname === '/remove' && o.query.email && o.query.token && o.query.index) {
    let {email, token, index} = o.query;
    index = parseInt(index, 10);
     const tokenItem = await ddb.getItem({
      TableName: 'login',
      Key: {
        email: {S: email + '.token'},
      }
    }).promise();

    const tokens = tokenItem.Item ? JSON.parse(tokenItem.Item.tokens.S) : [];
    if (tokens.includes(token)) {
      inventory.splice(index, 1);

      _respond(200, JSON.stringify({
        email,
        inventory,
      }));

      _respond(200, JSON.stringify(inventory));
    } else {
      _respond(401, 'not authorized');
    }
  } else {
    _respond(404, 'not found');
  }
} catch (err) {
  console.warn(err.stack);
}
};

const _handlePayments = async (req, res) => {
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
      TableName: 'login',
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
        TableName: 'login',
        Item: {
          email: {S: tokenItem.Item.email.S},
          name: {S: tokenItem.Item.name.S},
          tokens: {S: tokenItem.Item.tokens.S},
          mnemonic: {S: tokenItem.Item.mnemonic.S},
          addr: {S: tokenItem.Item.addr.S},
          state: {S: tokenItem.Item.state.S},
          stripeState: {S: JSON.stringify(stripeState)},
          stripeConnectState: {S: tokenItem.Item.stripeConnectState.S},
          githubOauthState: {S: tokenItem.Item.githubOauthState.S},
          whitelisted: {BOOL: tokenItem.Item.whitelisted.BOOL},
        }
      }).promise();

      _respond(200, JSON.stringify({
        email,
        token,
        name: tokenItem.Item.name.S,
        mnemonic: tokenItem.Item.mnemonic.S,
        addr: tokenItem.Item.addr.S,
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
      TableName: 'login',
      Key: {
        email: {S: email + '.token'},
      }
    }).promise();

    // console.log('got item', JSON.stringify(token), tokenItem && tokenItem.Item);

    const tokens = tokenItem.Item ? JSON.parse(tokenItem.Item.tokens.S) : [];
    if (tokens.includes(token)) {
      const stripeState = null;
      await ddb.putItem({
        TableName: 'login',
        Item: {
          email: {S: tokenItem.Item.email.S},
          name: {S: tokenItem.Item.name.S},
          tokens: {S: tokenItem.Item.tokens.S},
          mnemonic: {S: tokenItem.Item.mnemonic.S},
          addr: {S: tokenItem.Item.addr.S},
          state: {S: tokenItem.Item.state.S},
          stripeState: {S: JSON.stringify(stripeState)},
          stripeConnectState: {S: tokenItem.Item.stripeConnectState.S},
          githubOauthState: {S: tokenItem.Item.githubOauthState.S},
          whitelisted: {BOOL: tokenItem.Item.whitelisted.BOOL},
        }
      }).promise();

      _respond(200, JSON.stringify({
        email,
        token,
        name: tokenItem.Item.name.S,
        mnemonic: tokenItem.Item.mnemonic.S,
        addr: tokenItem.Item.addr.S,
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
      TableName: 'login',
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

    /* const {
      access_token,
      stripe_publishable_key,
      stripe_user_id,
    } = stripeConnectState; */

    const match = o.query.state.match(/^([^:]+):([^:]+):(.+)$/);
    if (match) {
      const queryEmail = match[1];
      const queryState = match[2];
      const queryUrl = match[3];

      const tokenItem = await ddb.getItem({
        TableName: 'login',
        Key: {
          email: {S: queryEmail + '.token'},
        }
      }).promise();
      const dbState = tokenItem.Item ? tokenItem.Item.state.S : null;
      // console.log('logging in', queryEmail, queryState, queryUrl, dbState, tokenItem.Item);

      if (dbState === queryState) {
        /* console.log('got json 2', queryEmail, queryState, stripeConnectState, {
          email: {S: tokenItem.Item.email.S},
          name: {S: tokenItem.Item.name.S},
          tokens: {S: tokenItem.Item.tokens.S},
          mnemonic: {S: tokenItem.Item.mnemonic.S},
          addr: {S: tokenItem.Item.addr.S},
          state: {S: tokenItem.Item.state.S},
          stripeConnectState: {S: JSON.stringify(stripeConnectState)},
          whitelisted: {BOOL: tokenItem.Item.whitelisted.BOOL},
        }); */

        await ddb.putItem({
          TableName: 'login',
          Item: {
            email: {S: tokenItem.Item.email.S},
            name: {S: tokenItem.Item.name.S},
            tokens: {S: tokenItem.Item.tokens.S},
            mnemonic: {S: tokenItem.Item.mnemonic.S},
            addr: {S: tokenItem.Item.addr.S},
            state: {S: tokenItem.Item.state.S},
            stripeState: {S: tokenItem.Item.stripeState.S},
            stripeConnectState: {S: JSON.stringify(stripeConnectState)},
            githubOauthState: {S: tokenItem.Item.githubOauthState.S},
            whitelisted: {BOOL: tokenItem.Item.whitelisted.BOOL},
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
      TableName: 'login',
      Key: {
        email: {S: email + '.token'},
      }
    }).promise();

    const tokens = tokenItem.Item ? JSON.parse(tokenItem.Item.tokens.S) : [];
    if (tokens.includes(token)) {
      await ddb.putItem({
        TableName: 'login',
        Item: {
          email: {S: tokenItem.Item.email.S},
          name: {S: tokenItem.Item.name.S},
          tokens: {S: tokenItem.Item.tokens.S},
          mnemonic: {S: tokenItem.Item.mnemonic.S},
          addr: {S: tokenItem.Item.addr.S},
          state: {S: tokenItem.Item.state.S},
          stripeState: {S: tokenItem.Item.stripeState.S},
          stripeConnectState: {S: JSON.stringify(null)},
          githubOauthState: {S: tokenItem.Item.githubOauthState.S},
          whitelisted: {BOOL: tokenItem.Item.whitelisted.BOOL},
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
        TableName: 'login',
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
            TableName: 'login',
            Item: {
              email: {S: tokenItem.Item.email.S},
              name: {S: tokenItem.Item.name.S},
              tokens: {S: tokenItem.Item.tokens.S},
              mnemonic: {S: tokenItem.Item.mnemonic.S},
              addr: {S: tokenItem.Item.addr.S},
              state: {S: tokenItem.Item.state.S},
              stripeState: {S: tokenItem.Item.stripeState.S},
              stripeConnectState: {S: tokenItem.Item.stripeConnectState.S},
              githubOauthState: {S: JSON.stringify(githubOauthState)},
              whitelisted: {BOOL: tokenItem.Item.whitelisted.BOOL},
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

/* const _handleToken = async (req, res) => {
  const _respond = (statusCode, body) => {
    res.statusCode = statusCode;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
    res.end(body);
  };

try {
  const {method} = req;
  const {query, pathname: p} = url.parse(req.url, true);
  console.log('token request', {method, query, p});

  if (method === 'GET') {
    console.log('token get request', {method, path: p});

    let match, tokenId, address, x, z;
    if ((match = p.match(/^\/token\/([0-9]+)$/)) && isFinite(tokenId = parseInt(match[1], 10))) {
      const tokenItem = await ddb.getItem({
        TableName: 'token',
        Key: {
          tokenId: {S: tokenId + '.token'},
        },
      }).promise();

      if (tokenItem && tokenItem.Item) {
        const addr = tokenItem.Item.addr.S;
        const name = JSON.parse(tokenItem.Item.name.S);
        const url = JSON.parse(tokenItem.Item.url.S);
        const type = JSON.parse(tokenItem.Item.type.S);
        const bindingUrl = JSON.parse(tokenItem.Item.bindingUrl.S);
        const key = JSON.parse(tokenItem.Item.key.S);
        const j = {
          tokenId,
          addr,
          name,
          url,
          type,
          bindingUrl,
          key,
        };
        _respond(200, JSON.stringify(j));
      } else {
        _respond(404, JSON.stringify({
          error: 'not found',
        }));
      }
    } else if ((match = p.match(/^\/tokens\/(.+)$/)) && (address = match[1])) {
      console.log('query address 1', {address});

      const result = await ddb.query({
        TableName : 'token',
        IndexName: 'addr-index',
        KeyConditionExpression: '#addr = :address',
        ExpressionAttributeNames: {
          '#addr': 'addr',
        },
        ExpressionAttributeValues: {
          ':address': {S: address},
        },
      }).promise();
      const items = result.Items.map(item => ({
        tokenId: parseInt(item.tokenId.S.replace(/\.token$/, ''), 10),
        addr: item.addr.S,
        url: JSON.parse(item.url.S),
        type: JSON.parse(item.type.S),
        name: JSON.parse(item.name.S),
        bindingUrl: JSON.parse(item.bindingUrl.S),
        key: JSON.parse(item.key.S),
      })).sort((a, b) => a.tokenId - b.tokenId);
      console.log('query address 2', {address, items: items.length});

      _respond(200, JSON.stringify(items));
    } else if ((match = p.match(/^\/coords\/(-?[0-9\.]+)\/(-?[0-9\.]+)$/)) && isFinite(x = parseFloat(match[1])) && isFinite(z = parseFloat(match[2]))) {
      const key = _getKey(x, z);
      console.log('query address 1', {x, z, key});

      const result = await ddb.query({
        TableName : 'token',
        IndexName: 'key-index',
        KeyConditionExpression: '#k = :k',
        ExpressionAttributeNames: {
          '#k': 'key',
        },
        ExpressionAttributeValues: {
          ':k': {S: JSON.stringify(key)},
        },
      }).promise();
      const items = result.Items.map(item => ({
        tokenId: parseInt(item.tokenId.S.replace(/\.token$/, ''), 10),
        addr: item.addr.S,
        url: JSON.parse(item.url.S),
        type: JSON.parse(item.type.S),
        name: JSON.parse(item.name.S),
        bindingUrl: JSON.parse(item.bindingUrl.S),
        key: JSON.parse(item.key.S),
      })).sort((a, b) => a.tokenId - b.tokenId);
      console.log('query address 2', {address, items: items.length});

      _respond(200, JSON.stringify(items));
    } else {
      _respond(400, JSON.stringify({
        error: 'invalid parameters',
      }));
    }
  } else if (method === 'POST') {
    let {email, token, name, url, type, tokenId, bindingUrl} = query;
    tokenId = parseInt(tokenId, 10);
    
    console.log('got request', method, {email, token, name, url, type, tokenId, bindingUrl});

    if (email && token) {
      let tokenItem;
      {
        const start = Date.now();
        tokenItem = await ddb.getItem({
          TableName: 'login',
          Key: {
            email: {S: email + '.token'},
          }
        }).promise();
        const end = Date.now();
        console.log('got login 1 time', end - start, tokenItem);
      }

      const tokens = tokenItem.Item ? JSON.parse(tokenItem.Item.tokens.S) : [];
      if (tokens.includes(token)) {
        const addr = tokenItem.Item.addr.S;
        console.log('got login 2', tokenItem, {email, token, name, url, type, addr, tokenId, bindingUrl});

        if (name && typeof type === 'string') { // new token
          let updateResult;
          {
            const start = Date.now();
            updateResult = await ddb.updateItem({
              TableName: 'token',
              Key: {
                tokenId: {S: 'tokenIds'},
              },
              AttributeUpdates: {
                tokenIds: {
                  Action: 'ADD',
                  Value: {
                    N: 1 + '',
                  },
                },
              },
              ReturnValues: 'ALL_NEW',
            }).promise();
            const end = Date.now();
            console.log('update token time', end - start, updateResult);
          }
          const tokenId = parseInt(updateResult.Attributes.tokenIds.N, 10);
          const hadUrl = !!url;
          if (!url) {
            url = `https://content.exokit.org/${tokenId}`;
          }
          const bindingUrl = '';
          const key = _getKeyFromBindingUrl(bindingUrl);

          {
            const start = Date.now();
            const result = await ddb.putItem({
              TableName: 'token',
              Item: {
                tokenId: {S: tokenId + '.token'},
                addr: {S: addr},
                url: {S: JSON.stringify(url)},
                type: {S: JSON.stringify(type)},
                name: {S: JSON.stringify(name)},
                bindingUrl: {S: JSON.stringify(bindingUrl)},
                key: {S: JSON.stringify(key)},
              }
            }).promise();
            const end = Date.now();
            console.log('put token time', end - start, result);
          }

          {
            const start = Date.now();
            api.execute({
              method: 'mintToken',
              data: {
                tokenId,
                addr,
                name,
              },
              wait: false,
            }).then(() => {
              const end = Date.now();
              console.log('mint token time', end - start);
            }).catch(err => {
              console.warn(err.stack);
            });
          }

          let uploadUrl;
          if (!hadUrl) {
            const start = Date.now();
            uploadUrl = s3.getSignedUrl('putObject', {
              Bucket: bucketNames.content,
              Key: tokenId + '',
              ContentType: type,
              Expires: 5*60,
            });
            const end = Date.now();
            console.log('get signed url time', end - start);
          } else {
            uploadUrl = null;
          }

          _respond(200, JSON.stringify({
            tokenId,
            addr,
            name,
            url,
            bindingUrl,
            key,
            uploadUrl,
          }));
        } else if (isFinite(tokenId) && bindingUrl && typeof type === 'string') { // bind token
          const tokenItem = await ddb.getItem({
            TableName: 'token',
            Key: {
              tokenId: {S: tokenId + '.token'},
            }
          }).promise();
          if (tokenItem && tokenItem.Item) {
            const addr = tokenItem.Item.addr.S;
            const name = JSON.parse(tokenItem.Item.name.S);
            const url = JSON.parse(tokenItem.Item.url.S);
            const key = _getKeyFromBindingUrl(bindingUrl);

            {
              const start = Date.now();
              const result = await ddb.putItem({
                TableName: 'token',
                Item: {
                  tokenId: {S: tokenId + '.token'},
                  addr: {S: addr},
                  name: {S: JSON.stringify(name)},
                  url: {S: JSON.stringify(url)},
                  type: {S: JSON.stringify(type)},
                  bindingUrl: {S: JSON.stringify(bindingUrl)},
                  key: {S: JSON.stringify(key)},
                }
              }).promise();
              const end = Date.now();
              console.log('put token time', end - start, result);
            }

            _respond(200, JSON.stringify({}));
          } else {
            _respond(404, JSON.stringify({
              error: 'not found',
            }));
          }
        } else if (isFinite(tokenId) && event.body) { // file upload
          // XXX make this remove old files first

          const files = _jsonParse(event.body);
          console.log('got files 1', {tokenId, files});

          if (Array.isArray(files) && files.length > 0 && files.every(f => Array.isArray(f) && f.length === 2 && typeof f[0] === 'string' && typeof f[1] === 'string')) {
            console.log('got files 2', {tokenId, files});

            const signedUrls = files.map(file => s3.getSignedUrl('putObject', {
              Bucket: bucketNames.content,
              Key: tokenId + '/' + file[0],
              ContentType: file[1],
              Expires: 5*60,
            }));
            console.log('got files 3', {tokenId, files, signedUrls});

            _respond(200, JSON.stringify(signedUrls));
          } else {
            _respond(400, JSON.stringify({
              error: 'invalid parameters',
            }));
          }
        } else {
          _respond(400, JSON.stringify({
            error: 'invalid parameters',
          }));
        }
      } else {
        _respond(403, JSON.stringify({
          error: 'invalid token',
        }));
      }
    } else {
      _respond(401, JSON.stringify({
        error: 'no token',
      }));
    }
  } else if (method === 'DELETE') {
    let {email, token, tokenId} = query;
    tokenId = parseInt(tokenId, 10);
    
    console.log('got request', method, {email, token, tokenId});

    if (email && token) {
      let tokenItem;
      {
        const start = Date.now();
        tokenItem = await ddb.getItem({
          TableName: 'login',
          Key: {
            email: {S: email + '.token'},
          }
        }).promise();
        const end = Date.now();
        console.log('got login 1 time', end - start, tokenItem);
      }

      const tokens = tokenItem.Item ? JSON.parse(tokenItem.Item.tokens.S) : [];
      if (tokens.includes(token)) {
        const addr = tokenItem.Item.addr.S;
        console.log('got login 2', tokenItem, {email, token, addr, tokenId});

        const tokenItem = await ddb.getItem({
          TableName: 'token',
          Key: {
            tokenId: {S: tokenId + '.token'},
          },
        }).promise();

        if (tokenItem && tokenItem.Item) {
          if (tokenItem.Item.addr.S === addr) {
            {
              const start = Date.now();
              api.execute({
                method: 'transferTo',
                data: {
                  addr: '0x0000000000000000000000000000000000000000',
                  tokenId,
                },
                wait: false,
              }).then(() => {
                const end = Date.now();
                console.log('burn token time', end - start);
              }).catch(err => {
                console.warn(err.stack);
              });
            }

            await ddb.deleteItem({
              TableName: 'token',
              Key: {
                tokenId: {S: tokenId + '.token'},
              }
            }).promise();

            _respond(200, JSON.stringify({
              error: 'invalid token',
            }));
          } else {
            _respond(403, JSON.stringify({
              error: 'not owned',
            }));
          }
        } else {
          _respond(404, JSON.stringify({
            error: 'not found',
          }));
        }
      } else {
        _respond(403, JSON.stringify({
          error: 'invalid token',
        }));
      }
    } else {
      _respond(401, JSON.stringify({
        error: 'no token',
      }));
    }
  } else if (method === 'OPTIONS') {
    // console.log('respond options');

    _respond(200, JSON.stringify({}));
  } else {
    _respond(404, JSON.stringify({
      error: 'invalid method',
    }));
  }
} catch(err) {
  console.warn(err);

  _respond(500, JSON.stringify({
    error: err.stack,
  }));
}
}; */

// const globalGithubAuthorization = `Basic ${Buffer.from(`${githubUsername}:${githubApiKey}`).toString('base64')}`;
const _handleGit = async (req, res) => {
  const _respond = (statusCode, body) => {
    res.statusCode = statusCode;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
    res.end(body);
  };

try {
  const {method, headers} = req;
  const {authorization = ''} = headers;

  console.log('git request 1', {method, url: req.url, authorization});

  const match = authorization.match(/^Basic (.+)$/i);
  if (match) {
    console.log('git request 2');
    const authString = Buffer.from(match[1], 'base64').toString('utf8');
    const match2 = authString.match(/^(.*?):(.*?)$/);
    if (match2) {
      console.log('git request 3');
      const username = match2[1];
      const password = match2[2];

      const tokenItem = await ddb.getItem({
        TableName: 'login',
        Key: {
          email: {S: username + '.token'},
        }
      }).promise();
      const tokens = tokenItem.Item ? JSON.parse(tokenItem.Item.tokens.S) : [];
      if (tokens.includes(password)) {
        const tokenGithubOauth = (tokenItem && tokenItem.Item.githubOauthState) ? JSON.parse(tokenItem.Item.githubOauthState.S) : null;
        console.log('git request 4', tokenGithubOauth);
        if (tokenGithubOauth) {
          console.log('git request 5', req.url);

          const match3 = req.url.match(/^\/([^\/]*)\/([^\/]*)\.git/);
          if (match3) {
            const repoUsername = decodeURIComponent(match3[1]);
            const repoName = decodeURIComponent(match3[2]);
            console.log('git request 6', repoUsername, repoName, tokenItem.Item.name.S);

            if (repoUsername === tokenItem.Item.name.S) {
              const githubUser = await new Promise((accept, reject) => {
                const proxyReq = https.request({
                  method: 'GET',
                  host: 'api.github.com',
                  path: `/user`,
                  headers: {
                    Authorization: `Token ${tokenGithubOauth.access_token}`,
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'exokit-server',
                  },
                }, proxyRes => {
                  if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
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
                  } else {
                    reject(new Error(`invalid status code: ${proxyRes.statusCode}`));
                  }
                });
                proxyReq.on('error', reject);
                proxyReq.end();
              });
              const githubUsername = githubUser.login;

              req.url = req.url.replace(/^\/[^\/]*\/[^\/]*\.git/, `/${githubUsername}/${repoName}.git`);

              console.log('git request 7', githubUsername, repoName, req.url);

              const githubAuthorization = `Basic ${new Buffer(`${githubUsername}:${tokenGithubOauth.access_token}`).toString('base64')}`;
              req.headers.authorization = githubAuthorization;
              const proxy = httpProxy.createProxyServer({});
              proxy
                .web(req, res, {
                  target: 'https://github.com',
                  // secure: false,
                  changeOrigin: true,
                }, err => {
                  console.warn(err.stack);

                  res.statusCode = 500;
                  res.end();
                });
              proxy.on('proxyRes', (proxyRes, req) => {
                console.log('got proxy res', proxyRes.statusCode);

                proxyRes.on('end', () => {
                  console.log('got finish');

                  if (method === 'POST') {
                    console.log('got post');

                    const _enablePages = () => new Promise((accept, reject) => {
                      const req = https.request({
                        method: 'POST',
                        host: 'api.github.com',
                        path: `/repos/${githubUsername}/${repoName}/pages`,
                        headers: {
                          Authorization: githubAuthorization,
                          Accept: 'application/vnd.github.switcheroo-preview+json',
                          'Content-Type': 'application/json',
                          'User-Agent': 'exokit-server',
                        },
                      }, res => {
                        console.log('got res 1', res.statusCode);

                        const bs = [];
                        res.on('data', b => {
                          bs.push(b);
                        });
                        res.on('end', () => {
                          const b = Buffer.concat(bs);
                          const s = b.toString('utf8');
                          console.log('got post 1', s);

                          accept(b);
                        });
                        req.on('error', reject);
                      });
                      req.on('error', reject);
                      req.end(JSON.stringify({
                        source: {
                          branch: 'master',
                          path: '',
                        },
                      }));
                    });
                    const _setPagesCname = () => new Promise((accept, reject) => {
                      const req = https.request({
                        method: 'PUT',
                        host: 'api.github.com',
                        path: `/repos/${githubUsername}/${repoName}/pages`,
                        headers: {
                          Authorization: githubAuthorization,
                          Accept: 'application/vnd.github.switcheroo-preview+json',
                          'Content-Type': 'application/json',
                          'User-Agent': 'exokit-server',
                        },
                      }, res => {
                        console.log('got res 2', res.statusCode);

                        const bs = [];
                        res.on('data', b => {
                          bs.push(b);
                        });
                        res.on('end', () => {
                          const b = Buffer.concat(bs);
                          const s = b.toString('utf8');
                          console.log('got post 2', s);

                          accept(b);
                        });
                        req.on('error', reject);
                      });
                      req.on('error', reject);
                      req.end(JSON.stringify({
                        cname: `${repoUsername}-${repoName}.${githubPagesDomain}`,
                      }));
                    });

                    _enablePages()
                      .then(() => {
                        _setPagesCname();
                      });
                  }
                });
              });
            } else {
              _respond(403, 'forbidden');
            }
          } else {
            _respond(404, 'not found');
          }
        } else {
          _respond(404, 'not found');
        }
      } else {
        _respond(403, 'invalid credentials');
      }
    } else {
      _respond(400, 'malformed credentials');
    }
  } else {
    res.setHeader('WWW-Authenticate', 'Basic realm="exokit"');
    _respond(401, 'not authorized');
  }
} catch(err) {
  console.warn(err);

  _respond(500, JSON.stringify({
    error: err.stack,
  }));
}
};

const _handleFiles = async (req, res) => {
  const _respond = (statusCode, body) => {
    res.statusCode = statusCode;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
    res.end(body);
  };
  const _getRepoFileSha = (username, reponame, pathname, access_token) => new Promise((accept, reject) => {
    const match = pathname.match(/^(.*)\/([^\/]+)$/);
    if (match) {
      const dirname = match[1];
      const filename = match[2];

      const proxyReq = https.request({
        method: 'GET',
        host: 'api.github.com',
        path: `/repos/${username}/${reponame}/contents${dirname}`,
        headers: {
          Authorization: `Token ${access_token}`,
          Accept: 'application/json',
          'User-Agent': 'exokit-server',
        },
      }, async proxyRes => {
        if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
          const dir = await new Promise((accept, reject) => {
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
          const file = dir.find(file => file.name === filename);
          if (file) {
            accept(file.sha);
          } else {
            accept(null);
          }
        } else {
          reject(new Error(`invalid status code: ${proxyRes.statusCode}`));
        }
      });
      proxyReq.on('error', reject);
      proxyReq.end();
    } else {
      accept(null);
    }
  });
  const _respondRepoData = (username, reponame, pathname, access_token) => {
    const _doIteration = i => {
      const fullPathname = pathname + (i === 0 ? '' : `.${i}`);
      const proxyReq = https.request({
        method: 'GET',
        host: 'raw.githubusercontent.com',
        path: `/${username}/${reponame}/master${fullPathname}`,
        headers: {
          Authorization: `Token ${access_token}`,
          // Accept: 'application/vnd.github.v3.raw',
          'User-Agent': 'exokit-server',
        },
      }, proxyRes => {
        if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
          res.statusCode = proxyRes.statusCode;
          const contentLength = parseInt(proxyRes.headers['content-length'], 10);
          // console.log('check content length', contentLength, maxChunkSize);
          if (contentLength === maxChunkSize) {
            proxyRes.pipe(res, {end: false});
            proxyRes.on('end', () => {
              _doIteration(i + 1);
            });
          } else {
            proxyRes.pipe(res);
          }
        } else if (proxyRes.statusCode === 404 && i !== 0) {
          res.end();
        } else {
          res.statusCode = proxyRes.statusCode;
          proxyRes.pipe(res);
        }
      });
      proxyReq.on('error', err => {
        res.statusCode = 500;
        res.end(err.stack);
      });
      proxyReq.end();
    };
    _doIteration(0);
  };

try {
  const {method} = req;

  if (method === 'OPTIONS') {
    res.statusCode = 200;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.end();
  } else {
    const {headers} = req;
    const {pathname: p} = url.parse(req.url);
    const {authorization = ''} = headers;
    console.log('files request 0', {method, url: req.url, p, authorization});

    const match = p.match(/^\/([^\/]*)\/([^\/]*)(\/.*)/);
    if (match) {
      const username = match[1];
      const reponame = match[2];
      const repopathname = match[3];

      console.log('files request 1 1', username, reponame, repopathname);

      if (method === 'GET' && reponame === 'webxr-home' && /^\/public(?:\/|$)/.test(repopathname)) {
        const tokenItem = await (async () => {
          const result = await ddb.query({
            TableName : 'login',
            IndexName: 'name-index',
            KeyConditionExpression: '#name = :repoUsername',
            ExpressionAttributeNames: {
              '#name': 'name',
            },
            ExpressionAttributeValues: {
              ':repoUsername': {S: username},
            },
          }).promise();
          return result.Items.length > 0 ? {Item: result.Items[0]} : null;
        })();
        const tokenGithubOauth = (tokenItem && tokenItem.Item.githubOauthState) ? JSON.parse(tokenItem.Item.githubOauthState.S) : null;

        console.log('files request 1 2', tokenGithubOauth);

        if (tokenGithubOauth) {
          const githubUser = await new Promise((accept, reject) => {
            const proxyReq = https.request({
              method: 'GET',
              host: 'api.github.com',
              path: `/user`,
              headers: {
                Authorization: `Token ${tokenGithubOauth.access_token}`,
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'exokit-server',
              },
            }, proxyRes => {
              if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
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
              } else {
                reject(new Error(`invalid status code: ${proxyRes.statusCode}`));
              }
            });
            proxyReq.on('error', reject);
            proxyReq.end();
          });
          const githubUsername = githubUser.login;

          console.log('files request 1 3', githubUsername, reponame, repopathname);

          _respondRepoData(githubUsername, reponame, repopathname, tokenGithubOauth.access_token);
        } else {
          _respond(404, JSON.stringify({
            error: 'not found',
          }));
        }
      } else {
        const match2 = authorization.match(/^Basic (.+)$/i);
        console.log('files request 2 1', authorization, match2);
        if (match2) {
          console.log('files request 2 2');
          const authString = Buffer.from(match2[1], 'base64').toString('utf8');
          const match3 = authString.match(/^(.*?):(.*?)$/);
          if (match3) {
            const username = match3[1];
            const password = match3[2];

            console.log('files request 2 3', username, password);

            const tokenItem = await ddb.getItem({
              TableName: 'login',
              Key: {
                email: {S: username + '.token'},
              }
            }).promise();
            const tokens = tokenItem.Item ? JSON.parse(tokenItem.Item.tokens.S) : [];
            if (tokens.includes(password)) {
              const tokenName = (tokenItem && tokenItem.Item.name) ? tokenItem.Item.name.S : null;
              const tokenGithubOauth = (tokenItem && tokenItem.Item.githubOauthState) ? JSON.parse(tokenItem.Item.githubOauthState.S) : null;

              if (tokenGithubOauth) {
                const githubUser = await new Promise((accept, reject) => {
                const proxyReq = https.request({
                    method: 'GET',
                    host: 'api.github.com',
                    path: `/user`,
                    headers: {
                      Authorization: `Token ${tokenGithubOauth.access_token}`,
                      Accept: 'application/json',
                      'Content-Type': 'application/json',
                      'User-Agent': 'exokit-server',
                    },
                  }, proxyRes => {
                    if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
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
                    } else {
                      reject(new Error(`invalid status code: ${proxyRes.statusCode}`));
                    }
                  });
                  proxyReq.on('error', reject);
                  proxyReq.end();
                });
                const githubUsername = githubUser.login;

                switch (method) {
                  case 'GET': {
                    // console.log('proxy target', {username, reponame, repopathname});
                    _respondRepoData(githubUsername, reponame, repopathname, tokenGithubOauth.access_token);
                    break;
                  }
                  case 'PUT': {
                    const _putContent = sha => new Promise((accept, reject) => {
                      console.log('put content 1', sha);

                      const _doIteration = i => {
                        console.log('put content 2', i);

                        let encoder, proxyReq, responsePromise;

                        let bytesRead = 0;
                        const _doRead = () => {
                          const _data = d => {
                            console.log('data', d.length, bytesRead, !!encoder);
                            _cleanup();

                            const dOk = d.slice(0, Math.max(maxChunkSize - bytesRead, 0));
                            bytesRead += dOk.length;

                            if (!encoder) {
                              const fullRepoPathname = repopathname + (i === 0 ? '' : `.${i}`);
                              responsePromise = _makePromise();
                              proxyReq = https.request({
                                method: 'PUT',
                                host: 'api.github.com',
                                path: `/repos/${githubUsername}/${reponame}/contents${fullRepoPathname}`,
                                headers: {
                                  Authorization: `Token ${tokenGithubOauth.access_token}`,
                                  'Content-Type': 'application/octet-stream',
                                  'User-Agent': 'exokit-server',
                                },
                              }, responsePromise.accept);
                              proxyReq.on('error', reject);
                              proxyReq.write(`{"message":${JSON.stringify(`put ${fullRepoPathname}`)},"sha":${JSON.stringify(sha)},"content":"`);
                              encoder = new Base64Encoder();
                              encoder.pipe(proxyReq, {end: false});
                            }
                            encoder.write(dOk);

                            if (bytesRead < maxChunkSize) {
                              _doRead();
                            } else {
                              const dOverflow = d.slice(dOk.length);
                              req.pause();
                              req.unshift(dOverflow);

                              console.log('flushing', bytesRead, maxChunkSize);

                              encoder.end();
                              encoder.on('end', () => {
                                proxyReq.end(`"}`);
                                responsePromise.then(() => {
                                  _doIteration(i + 1);
                                });
                              });
                            }
                          };
                          req.on('data', _data);
                          const _end = () => {
                            console.log('end', bytesRead, !!encoder);
                            _cleanup();

                            const _respondDone = () => {
                              _respond(200, JSON.stringify({
                                ok: true,
                              }));
                            };

                            if (encoder) {
                              encoder.end();
                              encoder.on('end', () => {
                                proxyReq.end(`"}`);
                                responsePromise.then(() => {
                                  _respondDone();
                                });
                              });
                            } else {
                              _respondDone();
                            }
                          };
                          req.on('end', _end);
                          const _cleanup = () => {
                            req.removeListener('data', _data);
                            req.removeListener('end', _end);
                          };
                          req.resume();
                        };
                        _doRead();
                      };
                      _doIteration(0);
                    });
                    _getRepoFileSha(githubUsername, reponame, repopathname, tokenGithubOauth.access_token)
                      .then(sha => {
                        return _putContent(sha)
                          .then(({statusCode, b}) => {
                            res.statusCode = statusCode;
                            res.end(b);
                          });
                      });
                    break;
                  }
                  case 'DELETE': {
                    const _deleteContent = sha => new Promise((accept, reject) => {
                      console.log('delete content 1', sha);

                      const proxyReq = https.request({
                        method: 'DELETE',
                        host: 'api.github.com',
                        path: `/repos/${githubUsername}/${reponame}/contents${repopathname}?message=${encodeURIComponent(`delete ${repopathname}`)}&sha=${sha}`,
                        headers: {
                          Authorization: `Token ${tokenGithubOauth.access_token}`,
                          'User-Agent': 'exokit-server',
                        },
                      }, res => {
                        const {statusCode} = res;
                        console.log('get 3', statusCode);

                        const bs = [];
                        res.on('data', b => {
                          bs.push(b);
                        });
                        res.on('end', () => {
                          const b = Buffer.concat(bs);
                          const s = b.toString('utf8');
                          console.log('get 5', s);

                          accept({statusCode, b});
                        });
                        res.on('error', reject);
                      });
                      proxyReq.on('error', reject);
                      proxyReq.end();
                    });
                    _getRepoFileSha(githubUsername, reponame, repopathname, tokenGithubOauth.access_token)
                      .then(o => _deleteContent(o.sha))
                      .then(({statusCode, b}) => {
                        res.statusCode = statusCode;
                        res.end(b);
                      });
                    break;
                  }
                }
              } else {
                _respond(404, JSON.stringify({
                  error: 'not found',
                }));
              }
            } else {
              _respond(403, 'invalid credentials');
            }
          } else {
            _respond(400, 'malformed credentials');
          }    
        } else {
          res.setHeader('WWW-Authenticate', 'Basic realm="exokit"');
          _respond(401, 'not authorized');
        }
      }
    } else {
      _respond(404, JSON.stringify({
        error: 'not found',
      }))
    }
  }
} catch(err) {
  console.warn(err);

  _respond(500, JSON.stringify({
    error: err.stack,
  }));
}
};

const _handleRepos = async (req, res) => {
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
  const _readResponseBodyJson = res => new Promise((accept, reject) => {
    const bs = [];
    res.on('data', b => {
      bs.push(b);
    });
    res.on('end', () => {
      accept(JSON.parse(Buffer.concat(bs).toString('utf8')));
    });
    res.on('error', err => {
      reject(err);
    });
  });

try {
  const {method} = req;

  if (method === 'OPTIONS') {
    res.statusCode = 200;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.end();
  } else {
    const {query, pathname: p} = url.parse(req.url, true);
    console.log('repos request', {method, query, p});

    const tokenItem = await (async () => {
      const {email, token} = query;
      if (email && token) {
        const tokenItem = await ddb.getItem({
          TableName: 'login',
          Key: {
            email: {S: email + '.token'},
          }
        }).promise();
        const tokens = tokenItem.Item ? JSON.parse(tokenItem.Item.tokens.S) : [];
        if (tokens.includes(token)) {
          return tokenItem;
        } else {
          return null;
        }
      } else {
        return null;
      }
    })();
    const tokenName = (tokenItem && tokenItem.Item.name) ? tokenItem.Item.name.S : null;
    const tokenGithubOauth = (tokenItem && tokenItem.Item.githubOauthState) ? JSON.parse(tokenItem.Item.githubOauthState.S) : null;

    if (method === 'GET') {
      const match = p.match(/^\/repos\/(.+)$/);
      if (match) {
        const repoUsername = decodeURIComponent(match[1]);
        const isAuthorized = tokenName === repoUsername && !!tokenGithubOauth;

        console.log('was authorized', {repoUsername, tokenName, tokenGithubOauth, isAuthorized});

        const _parseRepos = repos => repos.map(repo => {
          const {name, html_url, private, topics, has_pages} = repo;
          if (topics.includes(filterTopic)) {
            return {
              name,
              private,
              webxrUrl: has_pages ? `https://${tokenName}-${name}.${githubPagesDomain}/` : null,
              previewUrl: 'https://raw.githubusercontent.com/exokitxr/exokit/master/assets/icon.png',
              cloneUrl: `https://git.exokit.org/${encodeURIComponent(repoUsername)}/${encodeURIComponent(name)}`,
              repoUrl: html_url,
              topics,
            };
          } else {
            return null;
          }
        }).filter(repo => repo !== null);

        if (isAuthorized) {
          const proxyReq = https.request({
            method: 'GET',
            host: 'api.github.com',
            path: `/user/repos?visibility=all`,
            headers: {
              Authorization: `Token ${tokenGithubOauth.access_token}`,
              Accept: 'application/json',
              'User-Agent': 'exokit-server',
            },
          }, async proxyRes => {
            console.log('got res 1', res.statusCode);

            if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
              let repos = await _readResponseBodyJson(proxyRes);
              repos = _parseRepos(repos);
              _setCorsHeaders(res);
              res.end(JSON.stringify(repos));
            } else {
              res.statusCode = proxyRes.statusCode;
              proxyRes.pipe(res);
              proxyRes.on('error', err => {
                _respond(500, JSON.stringify({
                  error: err.stack
                }));
              });
            }
          });
          proxyReq.on('error', err => {
            _respond(500, JSON.stringify({
              error: err.stack
            }));
          });
          proxyReq.end();
        } else {
          const tokenItem = await (async () => {
            const result = await ddb.query({
              TableName : 'login',
              IndexName: 'name-index',
              KeyConditionExpression: '#name = :repoUsername',
              ExpressionAttributeNames: {
                '#name': 'name',
              },
              ExpressionAttributeValues: {
                ':repoUsername': {S: repoUsername},
              },
            }).promise();
            return result.Items.length > 0 ? {Item: result.Items[0]} : null;
          })();
          // console.log('query token item', tokenItem);
          const tokenGithubOauth = (tokenItem && tokenItem.Item.githubOauthState) ? JSON.parse(tokenItem.Item.githubOauthState.S) : null;

          if (tokenGithubOauth) {
            const proxyReq = https.request({
              method: 'GET',
              host: 'api.github.com',
              path: `/user/repos?visibility=public`,
              headers: {
                Authorization: `Token ${tokenGithubOauth.access_token}`,
                Accept: 'application/json',
                'User-Agent': 'exokit-server',
              },
            }, async proxyRes => {
              // console.log('got res 1', proxyRes.statusCode);

              if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
                let repos = await _readResponseBodyJson(proxyRes);
                repos = _parseRepos(repos);
                _setCorsHeaders(res);
                res.end(JSON.stringify(repos));
              } else {
                res.statusCode = proxyRes.statusCode;
                proxyRes.pipe(res);
                proxyRes.on('error', err => {
                  _respond(500, JSON.stringify({
                    error: err.stack
                  }));
                });
              }
            });
            proxyReq.on('error', err => {
              _respond(500, JSON.stringify({
                error: err.stack
              }));
            });
            proxyReq.end();
          } else {
            _setCorsHeaders(res);
            res.end(JSON.stringify([]));
          }
        }
      } else {
        _respond(404, JSON.stringify({
          error: 'not found',
        }));
      }
    } else if (method === 'PUT') {
      const match = p.match(/^\/repos\/([^\/]+)\/([^\/]+)$/);
      if (match) {
        const repoUsername = decodeURIComponent(match[1]);
        const repoName = decodeURIComponent(match[2]);
        const private = !!query.private;
        const isAuthorized = tokenName === repoUsername && !!tokenGithubOauth;

        if (isAuthorized) {
          const proxyReq = https.request({
            method: 'POST',
            host: 'api.github.com',
            path: `/user/repos`,
            headers: {
              Authorization: `Token ${tokenGithubOauth.access_token}`,
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'User-Agent': 'exokit-server',
            },
          }, proxyRes => {
            if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
              const proxyReq = https.request({
                method: 'PUT',
                host: 'api.github.com',
                path: `/repos/${repoUsername}/${repoName}/topics`,
                headers: {
                  Authorization: `Token ${tokenGithubOauth.access_token}`,
                  Accept: 'application/vnd.github.mercy-preview+json',
                  'Content-Type': 'application/json',
                  'User-Agent': 'exokit-server',
                },
              }, proxyRes => {
                res.statusCode = proxyRes.statusCode;
                _setCorsHeaders(res);
                res.end();
              });
              proxyReq.on('error', err => {
                _respond(500, JSON.stringify({
                  error: err.stack
                }));
              });
              proxyReq.end(JSON.stringify({
                names: [filterTopic],
              }));
            } else {
              res.statusCode = proxyRes.statusCode;
              _setCorsHeaders(res);
              proxyRes.pipe(res);
            }
          });
          proxyReq.on('error', err => {
            _respond(500, JSON.stringify({
              error: err.stack
            }));
          });
          proxyReq.end(JSON.stringify({
            name: repoName,
            private,
          }));
        } else {
          _respond(403, JSON.stringify({
            error: 'forbidden',
          }));
        }
      } else {
        _respond(404, JSON.stringify({
          error: 'not found',
        }));
      }
    } else if (method === 'DELETE') {
      const match = p.match(/^\/repos\/([^\/]+)\/([^\/]+)$/);
      if (match) {
        const repoUsername = decodeURIComponent(match[1]);
        const repoName = decodeURIComponent(match[2]);
        const private = !!query.private;
        const isAuthorized = tokenName === repoUsername && !!tokenGithubOauth;

        if (isAuthorized) {
          const githubUser = await new Promise((accept, reject) => {
            const proxyReq = https.request({
              method: 'GET',
              host: 'api.github.com',
              path: `/user`,
              headers: {
                Authorization: `Token ${tokenGithubOauth.access_token}`,
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'exokit-server',
              },
            }, proxyRes => {
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
            proxyReq.on('error', reject);
            proxyReq.end();
          });
          const githubUsername = githubUser.login;
          console.log('got gh username', githubUsername, repoName);

          const isWebxrSiteRepo = await new Promise((accept, reject) => {
            const proxyReq = https.request({
              method: 'GET',
              host: 'api.github.com',
              path: `/repos/${githubUsername}/${repoName}`,
              headers: {
                Authorization: `Token ${tokenGithubOauth.access_token}`,
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'exokit-server',
              },
            }, proxyRes => {
              if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
                const bs = [];
                proxyRes.on('data', b => {
                  bs.push(b);
                });
                proxyRes.on('end', () => {
                  const j = JSON.parse(Buffer.concat(bs).toString('utf8'));
                  accept(j.topics.includes(filterTopic));
                });
                proxyRes.on('error', err => {
                  reject(err);
                });
              } else {
                accept(false);
              }
            });
            proxyReq.on('error', reject);
            proxyReq.end();
          });
          if (isWebxrSiteRepo) {
            const proxyReq = https.request({
              method: 'DELETE',
              host: 'api.github.com',
              path: `/repos/${githubUsername}/${repoName}`,
              headers: {
                Authorization: `Token ${tokenGithubOauth.access_token}`,
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'exokit-server',
              },
            }, proxyRes => {
              // console.log('got res 1', proxyRes.statusCode);

              res.statusCode = proxyRes.statusCode;
              _setCorsHeaders(res);
              proxyRes.pipe(res);
              proxyRes.on('error', err => {
                _respond(500, JSON.stringify({
                  error: err.stack
                }));
              });
            });
            proxyReq.on('error', err => {
              _respond(500, JSON.stringify({
                error: err.stack
              }));
            });
            proxyReq.end(JSON.stringify({
              name: repoName,
              private,
            }));
          } else {
            _respond(404, JSON.stringify({
              error: 'not found',
            }));
          }
        } else {
          _respond(403, JSON.stringify({
            error: 'forbidden',
          }));
        }
      } else {
        _respond(404, JSON.stringify({
          error: 'not found',
        }));
      }
    } else {
      _respond(404, JSON.stringify({
        error: 'not found',
      }));
    }
  }
} catch(err) {
  console.warn(err);

  _respond(500, JSON.stringify({
    error: err.stack,
  }));
}
};

const _handleTokens = async (req, res) => {
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
    if (/\.png$/.test(p)) {
      res.statusCode = 301;
      res.setHeader('Location', 'https://raw.githubusercontent.com/exokitxr/exokit-web/master/favicon.png');
      _setCorsHeaders(res);
      res.end();
    } else {
      _setCorsHeaders(res);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        "name": "Meteria " + p,
        "description": "Metaverse material token",
        "image": "https://content.exokit.org/preview" + p,
        "external_url": "https://viewer.exokit.org" + p,
        // "background_color": "000000",
        // "animation_url": "https://exokit.org/models/exobot.glb",
        // "animation_url": "http://dl5.webmfiles.org/big-buck-bunny_trailer.webm",
        "properties": {
                "simple_property": "example value",
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
      }));
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

/* const browser = await puppeteer.launch({
  // args,
  defaultViewport: {
    width: 1280,
    height: 1280,
  },
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
  ],
  // executablePath: await chromium.executablePath,
  headless: true,
});

const _handleBrowser = async (req, res) => {
  const _respond = (statusCode, body) => {
    res.statusCode = statusCode;
    res.setHeader('Access-Control-Allow-Origin', '*');
    // res.setHeader('Access-Control-Allow-Headers', '*');
    // res.setHeader('Access-Control-Allow-Methods', '*');
    res.end(body);
  };

  let page;
try {
  page = await browser.newPage();

  page.on('error', err => {
    console.warn('error', err);
  });
  page.on('pageerror', err => {
    console.warn('pageerror', err);
  });

  const {query, pathname: p} = url.parse(req.url, true);
  if (query && query.u) {
    try {
      await page.goto(query.u);
    } catch (err) {
      console.warn('page error', err);

      _respond(404, JSON.stringify({
        error: 'not found',
      }));

      return;
    }

    const [anchors, screenshot] = await Promise.all([
      page.evaluate(() => {
        return Array.from(document.querySelectorAll('a')).map(a => {
          const {href} = a;
          const {x, y, width, height} = a.getBoundingClientRect();
          if (width > 0 && height > 0) {
            return {
              href,
              box: {
                x,
                y,
                width,
                height,
              },
            };
          } else {
            return null;
          }
        }).filter(a => a !== null);
      }),
      page.screenshot({
        type: 'jpeg',
        fullPage: true,
      }),
    ]);

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Anchors', JSON.stringify(anchors)),
    _respond(200, screenshot);
  } else {
    _respond(400, JSON.stringify({
      error: 'not found',
    }));
  }
} catch (err) {
  console.warn(err);

  _respond(500, JSON.stringify({
    error: err.stack,
  }));
} finally {
  if (page) {
    page.close();
  }
}
}; */

/* const _checkProxyApiKey = async req => {
  const referer = req.headers['referer'];
  if (referer) {
    const o = url.parse(referer, true);
    const domain = o.host;

    if (domain) {
      let keys = apiKeyCache.get(domain);
      if (keys === undefined) {
        const apiKeyItem = await ddb.getItem({
          TableName: 'api-key',
          Key: {
            domain: {S: domain},
          },
        }).promise();
        if (apiKeyItem.Item) {
          keys = JSON.parse(apiKeyItem.Item.keys.S);
        } else {
          const match = domain.match(/^([^\.]+)\.(.+)$/);
          if (match) {
            const subdomain = match[2];
            const apiKeyItem = await ddb.getItem({
              TableName: 'api-key',
              Key: {
                domain: {S: '*.' + subdomain},
              },
            }).promise();
            if (apiKeyItem.Item) {
              keys = JSON.parse(apiKeyItem.Item.keys.S);
            } else {
              keys = [];
            }
          } else {
            keys = [];
          }
        }
        apiKeyCache.set(domain, keys);
      }
      return keys === true || (Array.isArray(keys) && keys.includes(o.query.key));
    } else {
      return false;
    }
  } else {
    return false;
  }
}; */

const proxy = httpProxy.createProxyServer({});
proxy.on('proxyRes', (proxyRes, req) => {
  if (proxyRes.headers['location']) {
    const o = new url.URL(proxyRes.headers['location'], req.url);
    console.log('redirect location 1', req.url, proxyRes.headers['location'], o.href);
    o.host = o.host.replace('-', '--');
    o.host = o.protocol.slice(0, -1) + '-' + o.host.replace(/\./g, '-').replace(/:([0-9]+)$/, '-$1') + '.proxy.exokit.org';
    o.protocol = 'https:';
    proxyRes.headers['location'] = o.href;
  }
  proxyRes.headers['access-control-allow-origin'] = '*';
});

const _getChannels = async () => {
  const objects = await s3.listObjects({
    Bucket: bucketNames.rooms,
  }).promise();
  const result = [];
  const channelNames = objects.Contents;
  for (let i = 0; i < channelNames.length; i++) {
    const channelName = channelNames[i].Key;
    const html = await _getChannelHtml(channelName);
    result.push({
      channelName,
      html,
    });
  }
  return result;
};
const _getChannelHtml = async channelName => {
  try {
    const o = await s3.getObject({
      Bucket: bucketNames.rooms,
      Key: channelName,
    }).promise();
    return o.Body.toString('utf8');
  } catch(err) {
    return null;
  }
};
const _makeChannel = (channelName, html, saveHtml) => {
  let saving = false;
  let saveQueued = false;
  const channel = {
    channelName,
    connectionIds: [],
    sockets: [],
    htmlServer: new HTMLServer(html),
    files: {},
    async save() {
      if (!saving) {
        saving = true;

        await s3.putObject({
          Bucket: bucketNames.rooms,
          Key: channelName,
          ContentType: 'text/html',
          Body: this.htmlServer.getHtml(),
        }).promise();
        await new Promise((accept, reject) => {
          setTimeout(accept, 1000);
        });

        saving = false;
        if (saveQueued) {
          saveQueued = false;
          this.save();
        }
      } else {
        saveQueued = true;
      }
    },
    upload(fileName, req) {
      return new Promise((accept, reject) => {
        const bs = [];
        req.on('data', d => {
          bs.push(d);
        });
        req.on('end', () => {
          this.files[fileName] = bs;
          accept();
        });
        req.on('error', reject);
      });
    },
  };
  channel.htmlServer.addEventListener('send', e => {
    const data = e.detail;
    const {connection: socket, message} = data;
    socket.send(JSON.stringify(message));
  });
  return channel;
};
{
  const newChannels = await _getChannels();
  for (let i = 0; i < newChannels.length; i++) {
    const {channelName, html} = newChannels[i];
    channels[channelName] = _makeChannel(channelName, html, true);
  }
}

const discordClients = [];
const _getDiscordClient = token => {
  let client = discordClients.find(client => client.token === token);
  if (!client) {
    client = new Discord.Client();
    client.readyPromise = client.login(token);

    discordClients.push(client);
    client.on('disconnect', () => {
      discordClients.splice(discordClients.indexOf(client), 1);
    });
  }
  return client;
};

const presenceWss = new ws.Server({
  noServer: true,
});
presenceWss.on('connection', async (s, req, channels, saveHtml) => {
  const o = url.parse(req.url, true);
  const {c} = o.query;
  if (c) {
    const {remoteAddress} = req.connection;
    console.log('got connection', remoteAddress, c);

    let channel = channels[c];
    if (!channel) {
      channel = _makeChannel(c, `<xr-site></xr-site>`, saveHtml);
      channels[c] = channel;
    }

    const _proxyMessage = m => {
      for (let i = 0; i < channel.sockets.length; i++) {
        const s2 = channel.sockets[i];
        if (s2 !== s) {
          s2.send(m);
        }
      }
    };

    let connectionId = null;
    const discordClientUnbindFns = {};
    let discordAttachmentSpec = null;
    let discordAttachmentBuffer = null;
    s.on('message', m => {
      // console.log('got message', m);

      if (typeof m === 'string') {
        const data = _jsonParse(m);
        if (data) {
          // console.log('got data', data, data.method === 'ops', Array.isArray(data.ops), typeof data.baseIndex === 'number');
          if (data.method === 'init' && typeof data.connectionId === 'string') {
            if (!connectionId) {
              connectionId = data.connectionId;

              // console.log('send back state', channel.state);
              channel.htmlServer.connect(s);

              console.log('send forward to sockets', channel.sockets.length);
              channel.sockets.forEach(s => {
                s.send(JSON.stringify({
                  method: 'join',
                  connectionId,
                }));
              });

              console.log('send back sockets', channel.connectionIds.length);
              channel.connectionIds.forEach(connectionId => {
                s.send(JSON.stringify({
                  method: 'join',
                  connectionId,
                }));
              });

              channel.connectionIds.push(connectionId);
              channel.sockets.push(s);
            } else {
              console.warn('protocol error');
              s.close();
            }
          } else if (data.method === 'ping') {
            // nothing
          } else if (data.method === 'ops' && Array.isArray(data.ops) && typeof data.baseIndex === 'number') {
            // console.log('push ops', data);
            channel.htmlServer.pushOps(data.ops, data.baseIndex, s);
            if (saveHtml) {
              channel.save();
            }
          } else if (data.method === 'message' && typeof data.provider === 'string') {
            // console.log('push message', data);
            if (data.provider === 'discord' && typeof data.token === 'string' && typeof data.channel === 'string' && (typeof data.text === 'string' || typeof data.attachment === 'string')) {
              const client = _getDiscordClient(data.token);
              client.readyPromise.then(() => {
                const channel = client.channels.find(channel => channel.name === data.channel && channel.type === 'text');
                if (channel) {
                  if (typeof data.text === 'string') {
                    channel.send(data.text);
                  } else if (typeof data.attachment === 'string') {
                    const filename = data.attachment;
                    if (discordAttachmentBuffer) {
                      channel.send(new Discord.Attachment(discordAttachmentBuffer, filename));
                      discordAttachmentBuffer = null;
                    } else {
                      // console.log('prepare for attachment', data.attachment);
                      discordAttachmentSpec = {
                        channel,
                        filename,
                      };
                    }
                  } else {
                    console.warn('unknown message spec', data);
                  }
                } else {
                  console.warn('unknown channel', data.channel);
                }
              });
            } else {
              console.warn('unknown message format', data);
            }
          } else if (data.method === 'listen' && typeof data.provider === 'string') {
            if (data.provider === 'discord' && typeof data.token === 'string' && typeof data.channel === 'string') {
              const client = _getDiscordClient(data.token + '/' + data.channel);
              const _message = m => {
                if (m.channel.name === data.channel) {
                  s.send(JSON.stringify({
                    method: 'message',
                    provider: 'discord',
                    username: m.author.username,
                    text: m.content,
                    attachments: m.attachments.map(a => a.proxyURL),
                  }));
                }
              };
              client.on('message', _message);
              discordClientUnbindFns[data.token] = () => {
                client.removeListener('message', _message);
              };
            } else {
              console.warn('unknown listen format', data);
            }
          } else if (data.method === 'unlisten' && typeof data.provider === 'string') {
            if (data.provider === 'discord' && typeof data.token === 'string' && typeof data.channel === 'string') {
              const unbindFn = discordClientUnbindFns[data.token + '/' + data.channel];
              if (unbindFn) {
                unbindFn();
                delete discordClientUnbindFns[data.token];
              } else {
                console.warn('message unlisten listener not bound', data.token);
              }
            } else {
              console.warn('unknown unlisten format', data);
            }
          } else {
            const index = channel.connectionIds.indexOf(data.dst);
            if (index !== -1) {
              channel.sockets[index].send(m);
            }
          }
        } else {
          console.warn('protocol error');
          s.close();
        }
      } else if (Buffer.isBuffer(m)) {
        if (discordAttachmentSpec) {
          const {channel, filename} = discordAttachmentSpec;
          channel.send(new Discord.Attachment(m, filename));
          discordAttachmentSpec = null;
        } else {
          discordAttachmentBuffer = m;
        }
      } else {
        console.warn('protocol error');
        s.close();
      }
    });
    s.on('close', () => {
      console.log('lost connection', remoteAddress, connectionId);
      const index = channel.connectionIds.indexOf(connectionId);
      if (index !== -1) {
        channel.connectionIds.splice(index, 1);
        channel.sockets.splice(index, 1);

        channel.htmlServer.disconnect(s);
      }
      channel.sockets.forEach(s => {
        s.send(JSON.stringify({
          method: 'leave',
          connectionId,
        }));
      });
      /* if (channel.connectionIds.length === 0) {
        delete channels[c];
      } */
    });
  } else {
    s.close();
  }
});

const _req = protocol => (req, res) => {
try {

  const o = url.parse(protocol + '//' + (req.headers['host'] || '') + req.url);
  let match;
  if (o.host === 'login.exokit.org') {
    _handleLogin(req, res);
    return;
  } else if (o.host === 'presence.exokit.org') {
    _handlePresence(req, res, channels);
    return;
  } else if (o.host === 'upload.exokit.org') {
    _handleUpload(req, res);
    return;
  } else if (o.host === 'hashes.exokit.org') {
    _handleHashes(req, res);
    return;
  } else if (o.host === 'preview.exokit.org') {
    _handlePreview(req, res);
    return;
  } else if (o.host === 'grid.exokit.org') {
    _handleGrid(req, res);
    return;
  } else if (o.host === 'grid-presence.exokit.org') {
    _handlePresence(req, res, gridChannels);
    return;
  /* } else if (o.host === 'raw.exokit.org') {
    _handleRaw(req, res);
    return; */
  /* } else if (match = o.host.match(/^([a-z0-9\-]+)\.sites\.exokit\.org$/)) {
    const userName = match[1];
    if (o.path === '/sw.js') {
      proxy.web(req, res, {
        target: 'https://web.exokit.org',
        secure: false,
        changeOrigin: true,
      }, err => {
        console.warn(err.stack);

        res.statusCode = 500;
        res.end();
      });
      return;
    } else if (match = o.path.match(/^\/([^\/]+)(?:\/(?:index\.html)?)?$/)) {
      const channelName = match[1];
      _handleSites(req, res, userName, channelName);
      return;
    } */
  } else if (o.host === 'inventory.exokit.org') {
    _handleInventory(req, res);
    return;
  } else if (o.host === 'payments.exokit.org') {
    _handlePayments(req, res);
    return;
  } else if (o.host === 'oauth.exokit.org') {
    _handleOauth(req, res);
    return;
  /* } else if (o.host === 'token.exokit.org') {
    _handleToken(req, res);
    return; */
  } else if (o.host === 'repos.exokit.org') {
    _handleRepos(req, res);
    return;
  } else if (o.host === 'git.exokit.org') {
    _handleGit(req, res);
    return;
  } else if (o.host === 'files.exokit.org') {
    _handleFiles(req, res);
    return;
  } else if (o.host === 'tokens.exokit.org') {
    _handleTokens(req, res);
    return;
  } /* else if (o.host === 'browser.exokit.org') {
    _handleBrowser(req, res);
    return;
  } */

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

        console.log(oldUrl, '->', req.url);

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
const _ws = (req, socket, head) => {
  const host = req.headers['host'];
  if (host === 'presence.exokit.org') {
    presenceWss.handleUpgrade(req, socket, head, s => {
      presenceWss.emit('connection', s, req, channels, true);
    });
  } else if (host === 'grid-presence.exokit.org') {
    presenceWss.handleUpgrade(req, socket, head, s => {
      presenceWss.emit('connection', s, req, gridChannels, false);
    });
  } else {
    proxy.ws(req, socket, head);
  }
};

const server = http.createServer(_req('http:'));
server.on('upgrade', _ws);
const server2 = https.createServer({
  cert: CERT,
  key: PRIVKEY,
}, _req('https:'));
server2.on('upgrade', _ws);

const _warn = err => {
  console.warn('uncaught: ' + err.stack);
};
process.on('uncaughtException', _warn);
process.on('unhandledRejection', _warn);

server.listen(PORT);
server2.listen(443);

})();
