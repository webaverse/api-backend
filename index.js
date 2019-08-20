const fs = require('fs');
const url = require('url');
const http = require('http');
const https = require('https');

const httpProxy = require('http-proxy');
const ws = require('ws');
const AWS = require('aws-sdk');
const ddb = new AWS.DynamoDB();
const s3 = new AWS.S3();
const bucketName = 'content.webaverse.com';

const bip32 = require('./bip32.js');
const bip39 = require('./bip39.js');
const ethUtil = require('./ethereumjs-util.js');
const api = require('./api.js');

const CERT = fs.readFileSync('/etc/letsencrypt/live/webaverse.com/fullchain.pem');
const PRIVKEY = fs.readFileSync('/etc/letsencrypt/live/webaverse.com/privkey.pem');

const PORT = parseInt(process.env.PORT, 10) || 80;
const PARCEL_SIZE = 8;

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

const _handleToken = async (req, res) => {
try {
  const {method} = req;
  const {query, path: p} = url.parse(req.url, true);
  console.log('token request', {method, query});

  const _respond = (statusCode, body) => {
    res.statusCode = statusCode;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
    res.end(body);
  };

  if (method === 'GET') {
    console.log('token get request', method);

    let match, tokenId, address, x, z;
    if ((match = p.match(/^\/token\/([0-9]+)$/)) && (tokenId = parseInt(match[1], 10)) && isFinite(tokenId)) {
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
        const bindingUrl = JSON.parse(tokenItem.Item.bindingUrl.S);
        const key = JSON.parse(tokenItem.Item.key.S);
        const j = {
          tokenId,
          addr,
          name,
          url,
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
        name: JSON.parse(item.name.S),
        bindingUrl: JSON.parse(item.bindingUrl.S),
        key: JSON.parse(item.key.S),
      })).sort((a, b) => a.tokenId - b.tokenId);
      console.log('query address 2', {address, items: items.length});

      _respond(200, JSON.stringify(items));
    } else if ((match = /^\/coords\/(-?[0-9\.]+)\/(-?[0-9\.]+)$/) && (x = parseFloat(match[1])) && (z = parseFloat(match[2])) && isFinite(x) && isFinite(z)) {
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

        if (name && typeof type === 'string') {
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
          const url = `https://content.webaverse.com/${tokenId}`;
          const bindingUrl = '';
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
                url,
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
          {
            const start = Date.now();
            uploadUrl = s3.getSignedUrl('putObject', {
              Bucket: bucketName,
              Key: tokenId + '',
              ContentType: type,
              Expires: 5*60,
            });
            const end = Date.now();
            console.log('get signed url time', end - start);
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
        } else if (isFinite(tokenId) && bindingUrl) {
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
        } else if (isFinite(tokenId) && event.body) {
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
          console.log('mint token default');

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
          if (!name) {
            name = _randomString();
          }
          if (!url) {
            url = 'null://';
          }
          const bindingUrl = '';
          const key = _getKeyFromBindingUrl(bindingUrl);
          const uploadUrl = '';

          console.log('mint token 1', {tokenId, addr, name, url});

          {
            const start = Date.now();
            const result = await ddb.putItem({
              TableName: 'token',
              Item: {
                tokenId: {S: tokenId + '.token'},
                addr: {S: addr},
                name: {S: JSON.stringify(name)},
                url: {S: JSON.stringify(url)},
                bindingUrl: {S: JSON.stringify(bindingUrl)},
                key: {S: JSON.stringify(key)},
              }
            }).promise();
            const end = Date.now();
            console.log('put token time', end - start, result);
          }

          console.log('mint token 2', {tokenId, addr, name, url});

          {
            const start = Date.now();
            await api.execute({
              method: 'mintToken',
              data: {
                tokenId,
                addr,
                name,
                url,
              },
              wait: false,
            }).then(() => {
              const end = Date.now();
              console.log('mint token time', end - start);
            }).catch(err => {
              console.warn(err.stack);
            });
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
        /* } else {
          return {
            statusCode: 400,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': '*',
              'Access-Control-Allow-Methods': '*',
            },
            body: JSON.stringify('invalid parameters'),
          }; */
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
  } else if (event.httpMethod === 'OPTIONS') {
    // console.log('respond options');

    _respond(200, JSON.stringify({}));
  } else {
    _respond(404, JSON.stringify({
      error: 'invalid method',
    }));
  }
} catch(err) {
  console.warn(err);

  return {
    statusCode: 500,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': '*',
    },
    body: JSON.stringify(err.stack),
  };
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

  const oldUrl = req.url;
  const o = url.parse(protocol + '//' + (req.headers['host'] || '') + req.url);
  const match = o.host.match(/^(.+)\.proxy\.webaverse\.com$/);
  if (match) {
    const raw = match[1];
    const match2 = raw.match(/^(https?-)(.+?)(-[0-9]+)?$/);
    if (match2) {
      o.protocol = match2[1].replace(/-/g, ':');
      o.host = match2[2].replace(/-/g, '.').replace(/\.\./g, '-') + (match2[3] ? match2[3].replace(/-/g, ':') : '');
      req.url = url.format(o);

      console.log(oldUrl, '->', req.url);

      proxy.web(req, res, {
        target: o.protocol + '//' + o.host,
        secure: false,
        changeOrigin: true,
      });
      return;
    }
  }
  if (o.host === 'token.webaverse.com') {
    _handleToken(req, res);
    return;
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
  console.warn(err.stack);
};
process.on('uncaughtException', _warn);
process.on('unhandledRejection', _warn);

server.listen(PORT);
server2.listen(443);
