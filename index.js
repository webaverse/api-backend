const fs = require('fs');
const url = require('url');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const httpProxy = require('http-proxy');
const ws = require('ws');
const AWS = require('aws-sdk');
const {accessKeyId, secretAccessKey} = require('./config.json');
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
const bucketName = 'content.webaverse.com';

const bip32 = require('./bip32.js');
const bip39 = require('./bip39.js');
const ethUtil = require('./ethereumjs-util.js');
const api = require('./api.js');

const CERT = fs.readFileSync('/etc/letsencrypt/live/webaverse.com/fullchain.pem');
const PRIVKEY = fs.readFileSync('/etc/letsencrypt/live/webaverse.com/privkey.pem');

const PORT = parseInt(process.env.PORT, 10) || 80;
const PARCEL_SIZE = 8;

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

const _handleLogin = async (req, res) => {
try {
    const {method} = req;
    const {query, path: p} = url.parse(req.url, true);

    console.log('got login', {method, p, query});

    const _respond = (statusCode, body) => {
      res.statusCode = statusCode;
      res.setHeader('Access-Control-Allow-Origin', '*');
      // res.setHeader('Access-Control-Allow-Headers', '*');
      // res.setHeader('Access-Control-Allow-Methods', '*');
      res.end(body);
    };

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
            _respond(200, JSON.stringify({}));
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
              const tokens = tokenItem.Item ? JSON.parse(tokenItem.Item.tokens.S) : [];
              let mnemonic = tokenItem.Item ? tokenItem.Item.mnemonic.S : null;
              let addr = tokenItem.Item ? tokenItem.Item.addr.S : null;
              
              console.log('old item', tokenItem, {tokens, mnemonic});

              const token = crypto.randomBytes(32).toString('base64');
              tokens.push(token);
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
              
              console.log('new item', {tokens, mnemonic, addr});
              
              await ddb.putItem({
                TableName: 'login',
                Item: {
                  email: {S: email + '.token'},
                  tokens: {S: JSON.stringify(tokens)},
                  mnemonic: {S: mnemonic},
                  addr: {S: addr},
                }
              }).promise();

              _respond(200, JSON.stringify({
                email,
                token,
                mnemonic,
                addr,
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
                          Data: `<h1>${code}</h1> is your verification code. <a href="https://webaverse.com/login?email=${encodeURIComponent(email)}&code=${encodeURIComponent(code)}"><strong>Log in</strong></a>`
                      }
                  },
                  
                  Subject: {
                      Data: `Verification code for Webaverse`
                  }
              },
              Source: "noreply@webaverse.com"
          };
      
          
          const data = await ses.sendEmail(params).promise();
          
          console.log('got response', data);
          
          _respond(200, JSON.stringify({}));
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

const _handleToken = async (req, res) => {
try {
  const {method} = req;
  const {query, path: p} = url.parse(req.url, true);
  console.log('token request', {method, query, p});

  const _respond = (statusCode, body) => {
    res.statusCode = statusCode;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
    res.end(body);
  };

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
            url = `https://content.webaverse.com/${tokenId}`;
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
              Bucket: bucketName,
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
              Bucket: bucketName,
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
};

const proxy = httpProxy.createProxyServer({});
proxy.on('proxyRes', proxyRes => {
  if (proxyRes.headers['location']) {
    const o = url.parse(proxyRes.headers['location']);
    o.host = o.protocol.slice(0, -1) + '-' + o.host.replace(/\./g, '-').replace(/:([0-9]+)$/, '-$1') + '.proxy.webaverse.com';
    o.protocol = 'https:';
    proxyRes.headers['location'] = url.format(o);
  }
  proxyRes.headers['access-control-allow-origin'] = '*';
});

const connectionIds = [];
const sockets = [];
const presenceWss = new ws.Server({
  noServer: true,
});
presenceWss.on('connection', (s, req) => {
  const {remoteAddress} = req.connection;
  console.log('got connection', remoteAddress);

  let connectionId = null;
  s.on('message', m => {
    console.log('got message', m);

    const data = _jsonParse(m);
    if (data) {
      if (data.method === 'init' && typeof data.connectionId === 'string') {
        if (!connectionId) {
          connectionId = data.connectionId;

          console.log('send forward sockets', sockets.length);
          sockets.forEach(s => {
            s.send(JSON.stringify({
              method: 'join',
              connectionId,
            }));
          });

          console.log('send back sockets', connectionIds.length);
          connectionIds.forEach(connectionId => {
            s.send(JSON.stringify({
              method: 'join',
              connectionId,
            }));
          });

          connectionIds.push(connectionId);
          sockets.push(s);
        } else {
          console.warn('protocol error');
          s.close();
        }
      } else if (data.method === 'ping') {
        // nothing
      } else {
        const index = connectionIds.indexOf(data.dst);
        if (index !== -1) {
          sockets[index].send(m);
        }
      }
    } else {
      console.warn('protocol error');
      s.close();
    }
  });
  s.on('close', () => {
    console.log('lost connection', remoteAddress, connectionId);
    const index = connectionIds.indexOf(connectionId);
    if (index !== -1) {
      connectionIds.splice(index, 1);
      sockets.splice(index, 1);
    }
    sockets.forEach(s => {
      s.send(JSON.stringify({
        method: 'leave',
        connectionId,
      }));
    });
  });
});

const _req = protocol => (req, res) => {
try {

  const o = url.parse(protocol + '//' + (req.headers['host'] || '') + req.url);
  if (o.host === 'login.webaverse.com') {
    _handleLogin(req, res);
    return;
  } else if (o.host === 'token.webaverse.com') {
    _handleToken(req, res);
    return;
  }

  const match = o.host.match(/^(.+)\.proxy\.webaverse\.com$/);
  if (match) {
    const raw = match[1];
    const match2 = raw.match(/^(https?-)(.+?)(-[0-9]+)?$/);
    if (match2) {
      o.protocol = match2[1].replace(/-/g, ':');
      o.host = match2[2].replace(/-/g, '.').replace(/\.\./g, '-') + (match2[3] ? match2[3].replace(/-/g, ':') : '');
      const oldUrl = req.url;
      req.url = url.format(o);

      console.log(oldUrl, '->', req.url);

      proxy.web(req, res, {
        target: o.protocol + '//' + o.host,
        secure: false,
        changeOrigin: true,
      }, err => {
        console.warn(err.stack);

        res.statusCode = 500;
        res.end();
      });
      return;
    }
  }

  res.statusCode = 404;
  res.end('host not found');
} catch(err) {
  console.warn(err.stack);

  res.statusCode = 500;
  res.end();
}
};
const _ws = (req, socket, head) => {
  const host = req.headers['host'];
  if (host === 'presence.webaverse.com') {
    presenceWss.handleUpgrade(req, socket, head, s => {
      presenceWss.emit('connection', s, req);
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
