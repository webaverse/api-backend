const fs = require('fs');
const url = require('url');
const http = require('http');
const https = require('https');
const httpProxy = require('http-proxy');

const PORT = parseInt(process.env.PORT, 10) || 80;
const CERT = fs.readFileSync('/etc/letsencrypt/live/proxy.webaverse.com/fullchain.pem');
const PRIVKEY = fs.readFileSync('/etc/letsencrypt/live/proxy.webaverse.com/privkey.pem');
/* const CERT = fs.readFileSync('fullchain.pem');
const PRIVKEY = fs.readFileSync('privkey.pem'); */

const proxy = httpProxy.createProxyServer({});
proxy.on('proxyRes', proxyRes => {
  if (proxyRes.headers['location']) {
    const o = url.parse(proxyRes.headers['location']);
    o.host = o.protocol.slice(0, -1) + '-' + o.host.replace(/\./g, '-').replace(/:([0-9]+)$/, '-$1') + '.proxy.webaverse.com';
    o.protocol = 'https:';
    proxyRes.headers['location'] = url.format(o);
  }
});

const _req = protocol => (req, res) => {
try {

  const oldUrl = req.url;
  const o = url.parse(protocol + '//' + (req.headers['host'] || '') + req.url);
  const ok = (() => {
    const match = o.host.match(/^(.+)\.proxy\.webaverse\.com$/);
    if (match) {
      const raw = match[1];
      const match2 = raw.match(/^(https?-)(.+?)(-[0-9]+)?$/);
      if (match2) {
        o.protocol = match2[1].replace(/-/g, ':');
        o.host = match2[2].replace(/-/g, '.').replace(/\.\./g, '-') + (match2[3] ? match2[3].replace(/-/g, ':') : '');
        return true;
      } else {
        console.log('invalid 2', raw);
        return false;
      }
    } else {
      console.log('invalid 1', o.host);
      return false;
    }
  })();
  // console.log(ok + ' - ' + o.protocol + ' - ' + o.host);

  if (ok) {
    req.url = url.format(o);

    console.log(oldUrl, '->', req.url);

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
