const fs = require('fs');
const url = require('url');
const http = require('http');
const https = require('https');
const httpProxy = require('http-proxy');

const PORT = parseInt(process.env.PORT, 10) || 80;
const PREFIX = 'https://proxy.webaverse.com/';
const CERT = fs.readFileSync('/etc/letsencrypt/live/proxy.webaverse.com/fullchain.pem');
const PRIVKEY = fs.readFileSync('/etc/letsencrypt/live/proxy.webaverse.com/privkey.pem');

const proxy = httpProxy.createProxyServer({});
proxy.on('proxyRes', proxyRes => {
  if (proxyRes.headers['location']) {
    proxyRes.headers['location'] = PREFIX + proxyRes.headers['location'];
  }
});

const _req = (req, res) => {
try {

  const oldUrl = req.url;
  req.url = url.parse(req.url).path.slice(1);
  const o = url.parse(req.url);

  if (o.protocol && o.host) {
    console.log(oldUrl, '->', req.url, o);
    proxy.web(req, res, {
      target: o.protocol + '//' + o.host,
      secure: false,
      changeOrigin: true,
    });
  } else {
    console.log(oldUrl, '-> x');

    res.statusCode = 400;
    res.end();
  }

} catch(err) {
  console.warn(err.stack);

  res.statusCode = 500;
  res.end();
}
};
const _ws = (req, socket, head) => {
  proxy.ws(req, socket, head);
};

const server = http.createServer(_req);
server.on('upgrade', _ws);
const server2 = https.createServer({
  cert: CERT,
  key: PRIVKEY,
}, _req);
server2.on('upgrade', _ws);

const _warn = err => {
  console.warn(err.stack);
};
process.on('uncaughtException', _warn);
process.on('unhandledRejection', _warn);

server.listen(PORT);
server2.listen(443);
