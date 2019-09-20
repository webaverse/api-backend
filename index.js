const fs = require('fs');
const url = require('url');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const httpProxy = require('http-proxy');
const ws = require('ws');
const LRU = require('lru');
const parse5 = require('parse5');
const AWS = require('aws-sdk');
// const puppeteer = require('puppeteer');
const namegen = require('./namegen.js');
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
const apiKeyCache = new LRU({
  max: 1024,
  maxAge: 60 * 1000,
});

const bip32 = require('./bip32.js');
const bip39 = require('./bip39.js');
const ethUtil = require('./ethereumjs-util.js');
const api = require('./api.js');

const CERT = fs.readFileSync('/etc/letsencrypt/live/exokit.org/fullchain.pem');
const PRIVKEY = fs.readFileSync('/etc/letsencrypt/live/exokit.org/privkey.pem');

const PORT = parseInt(process.env.PORT, 10) || 80;
const PARCEL_SIZE = 8;

const bucketNames = {
  content: 'content.exokit.org',
  channels: 'channels.exokit.org',
};

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
    const {query, path: p} = url.parse(req.url, true);

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
              const tokens = (tokenItem.Item && tokenItem.Item.tokens) ? JSON.parse(tokenItem.Item.tokens.S) : [];
              let name = (tokenItem.Item && tokenItem.Item.name) ? tokenItem.Item.name.S : null;
              let mnemonic = (tokenItem.Item && tokenItem.Item.mnemonic) ? tokenItem.Item.mnemonic.S : null;
              let addr = (tokenItem.Item && tokenItem.Item.addr) ? tokenItem.Item.addr.S : null;
              
              console.log('old item', tokenItem, {tokens, mnemonic});

              const token = crypto.randomBytes(32).toString('base64');
              tokens.push(token);
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

              console.log('new item', {name, tokens, mnemonic, addr});
              
              await ddb.putItem({
                TableName: 'login',
                Item: {
                  email: {S: email + '.token'},
                  name: {S: name},
                  tokens: {S: JSON.stringify(tokens)},
                  mnemonic: {S: mnemonic},
                  addr: {S: addr},
                  whitelisted: {BOOL: true},
                }
              }).promise();

              _respond(200, JSON.stringify({
                email,
                token,
                name,
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

const _handlePresence = async (req, res) => {
  const _respond = (statusCode, body) => {
    res.statusCode = statusCode;
    res.setHeader('Access-Control-Allow-Origin', '*');
    // res.setHeader('Access-Control-Allow-Headers', '*');
    // res.setHeader('Access-Control-Allow-Methods', '*');
    res.end(body);
  };

try {
  const {method} = req;
  const {path: p} = url.parse(req.url);
  console.log('presence request', {method, p});

  if (method === 'GET') {
    console.log('presence get request', {method, path: p});

    if (p === '/channels') {
      const channels = [];
      const _recurse = async (marker = null) => {
        const o = {
          Bucket: bucketNames.channels,
        };
        if (marker) {
          o.Marker = marker;
        }
        const r = await s3.listObjects(o).promise();
        for (let i = 0; i < r.Contents.length; i++) {
          const item = r.Contents[i].Key;
          const split = item.split('/');
          if (split.length === 2) {
            const [user, channel] = split;
            channels.push({
              user,
              channel,
            });
          }
        }
        if (r.IsTruncated) {
          await _recurse(r.NextMarker);
        }
      };
      await _recurse();

      _respond(200, JSON.stringify(channels));
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
} catch(err) {
  console.warn(err);

  _respond(500, JSON.stringify({
    error: err.stack,
  }));
}
};

const _handleSites = async (req, res, userName, channelName) => {
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
};

const _handleToken = async (req, res) => {
  const _respond = (statusCode, body) => {
    res.statusCode = statusCode;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
    res.end(body);
  };

try {
  const {method} = req;
  const {query, path: p} = url.parse(req.url, true);
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

  const {query, path: p} = url.parse(req.url, true);
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

const _checkProxyApiKey = async req => {
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
};

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

const _normalizeEl = el => {
  const result = {
    nodeName: el.nodeName,
    tagName: el.tagName,
    attrs: el.attrs,
    value: el.value,
    childNodes: el.childNodes ? el.childNodes.map(childEl => _normalizeEl(childEl)) : [],
  };
  return result;
};
const _parseHtmlString = htmlString => {
  const dom = parse5.parseFragment(htmlString);
  return _normalizeEl(dom);
  /* let root = dom.childNodes[0];
  root = _normalizeEl(root);
  return root; */
};
const _findElByKeyPath = (el, keyPath) => {
  for (let i = 0; i < keyPath.length; i++) {
    el = el.childNodes[keyPath[i]];
    if (!el) {
      el = null;
      break;
    }
  }
  return el;
};
const _makeChannel = async (userName, channelName) => {
  const k = `${userName}/${channelName}`;
  const htmlStringRes = await s3.getObject({
    Bucket: bucketNames.channels,
    Key: k,
  }).promise().catch(async err => {
    if (err.code === 'NoSuchKey') {
      const htmlString = `<xr-site></xr-site>`;
      await s3.putObject({
        Bucket: bucketNames.channels,
        Key: k,
        ContentType: 'text/html',
        Body: htmlString,
      }).promise().catch(err => {
        console.warn(err.stack);
      });

      return {
        Body: {
          toString() {
            return htmlString;
          },
        },
      };
    } else {
      throw err;
    }
  });
  const htmlString = htmlStringRes.Body.toString('utf8');
  const state = _parseHtmlString(htmlString);

  return {
    userName,
    channelName,
    state,
    connectionIds: [],
    sockets: [],
    users: [],
    _pushing: false,
    _queued: false,
    setHtml(htmlString) {
      this.state = _parseHtmlString(htmlString);
      this.pushAsync();
    },
    editState(editSpec) {
      const {keyPath, method, key, value, values} = editSpec;
      const el = _findElByKeyPath(this.state, keyPath);
      if (el) {
        switch (method) {
          case 'setAttributes': {
            for (let i = 0; i < values.length; i++) {
              const {key, value} = values[i];
              let attr = el.attrs.find(attr => attr.name === key);
              if (!attr) {
                attr = {
                  name: key,
                  value: null,
                };
                el.attrs.push(attr);
              }
              attr.value = value;
            }
            break;
          }
          case 'setAttribute': {
            let attr = el.attrs.find(attr => attr.name === key);
            if (!attr) {
              attr = {
                name: key,
                value: null,
              };
              el.attrs.push(attr);
            }
            attr.value = value;
            break;
          }
          case 'removeAttribute': {
            const index = el.attrs.findIndex(attr => attr.name === key);
            if (index !== -1) {
              el.attrs.splice(index, 1);
            } else {
              console.warn('remove missing attribute', keyPath, key);
            }
            break;
          }
          case 'appendChild': {
            const newEl = _parseHtmlString(value).childNodes[0];
            el.childNodes.push(newEl);
            break;
          }
          case 'removeChild': {
            const index = key;
            if (index < el.childNodes.length) {
              el.childNodes.splice(index, 1);
            } else {
              console.warn('remove missing child', keyPath, key);
            }
            break;
          }
        }
        this.pushAsync();
      } else {
        console.warn('could not find node', keyPath);
      }
    },
    async pushAsync() {
      if (!this._pushing) {
        this._pushing = true;

        const htmlString = parse5.serialize(this.state);
        await s3.putObject({
          Bucket: bucketNames.channels,
          Key: k,
          ContentType: 'text/html',
          Body: htmlString,
        }).promise().catch(err => {
          console.warn(err.stack);
        });

        this._pushing = false;
        if (this._queued) {
          this._queued = false;
          this.pushAsync();
        }
      } else {
        this._queued = true;
      }
    },
  };
};
const channels = {};
const presenceWss = new ws.Server({
  noServer: true,
});
presenceWss.on('connection', async (s, req) => {
  const o = url.parse(req.url, true);
  const {u, c} = o.query;
  if (u && c) {
    const {remoteAddress} = req.connection;
    console.log('got connection', remoteAddress, u, c);

    let channel = channels[c];
    if (!channel) {
      channel = await _makeChannel(u, c);
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
    s.on('message', m => {
      console.log('got message', m);

      const data = _jsonParse(m);
      if (data) {
        if (data.method === 'init' && typeof data.connectionId === 'string') {
          if (!connectionId) {
            connectionId = data.connectionId;

            // console.log('send back state');
            s.send(JSON.stringify({
              method: 'initState',
              state: channel.state,
            }));

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
            channel.users.push(u);
          } else {
            console.warn('protocol error');
            s.close();
          }
        } else if (data.method === 'ping') {
          // nothing
        } else if (data.method === 'setHtml' && data.html) {
          channel.setHtml(data.html);
          _proxyMessage(m);
        } else if (data.method === 'editState' && data.spec) {
          channel.editState(data.spec);
          _proxyMessage(m);
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
    });
    s.on('close', () => {
      console.log('lost connection', remoteAddress, connectionId);
      const index = channel.connectionIds.indexOf(connectionId);
      if (index !== -1) {
        channel.connectionIds.splice(index, 1);
        channel.sockets.splice(index, 1);
        channel.users.splice(index, 1);
      }
      channel.sockets.forEach(s => {
        s.send(JSON.stringify({
          method: 'leave',
          connectionId,
        }));
      });
      if (channel.connectionIds.length === 0) {
        delete channels[c];
      }
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
    _handlePresence(req, res);
    return;
  } else if (match = o.host.match(/^([a-z0-9\-]+)\.sites\.exokit\.org$/)) {
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
    }
  } else if (o.host === 'token.exokit.org') {
    _handleToken(req, res);
    return;
  } /* else if (o.host === 'browser.exokit.org') {
    _handleBrowser(req, res);
    return;
  } */

  if (match = o.host.match(/^(.+)\.proxy\.exokit.org$/)) {
    const raw = match[1];
    const match2 = raw.match(/^(https?-)(.+?)(-[0-9]+)?$/);
    if (match2) {
      _checkProxyApiKey(req)
        .then(ok => {
          if (ok) {
            if (req.method === 'OPTIONS') {
              res.statusCode = 200;
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
          } else {
            res.statusCode = 403;
            res.end('invalid domain or api key');
          }
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
  if (host === 'presence.exokit.org') {
    presenceWss.handleUpgrade(req, socket, head, s => {
      presenceWss.emit('connection', s, req);
    });
  } else {
    _checkProxyApiKey(req)
      .then(ok => {
        if (ok) {
          proxy.ws(req, socket, head);
        } else {
          socket.destroy();
        }
      });
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
