const path = require('path');
const stream = require('stream');
const fs = require('fs');
const url = require('url');
const querystring = require('querystring');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const zlib = require('zlib');
const child_process = require('child_process');

const {getObject, putObject} = require('../aws.js');
const puppeteer = require('puppeteer');

const PREVIEW_HOST = '127.0.0.1';
const PREVIEW_PORT = 8999;

const bucketNames = {
  preview: 'preview.exokit.org',
};

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

const _warn = err => {
  console.warn('uncaught: ' + err.stack);
};
process.on('uncaughtException', _warn);
process.on('unhandledRejection', _warn);

let browser;
const serverPromise = _makePromise();
let cbIndex = 0;
const cbs = {};

(async () => {
browser = await puppeteer.launch({
  args: [
    '--no-sandbox',
    // '--no-zygote',
    // '--disable-dev-shm-usage',
  ],
  // defaultViewport: chromium.defaultViewport,
  // executablePath: await chromium.executablePath,
  headless: true,
});

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', '*');
  if (req.method === 'OPTIONS') {
    res.end();
  } else if (req.method === 'POST') {
    const match = req.url.match(/^\/([0-9]+)/);
    // console.log('callback server 1', req.url, !!match);
    if (match) {
      const index = parseInt(match[1], 10);
      const cb = cbs[index];
      // console.log('callback server 2', req.url, index, !!cb);
      if (cb) {
        delete cbs[index];
        cb({req, res});
      } else {
        res.statusCode = 404;
        res.end();
      }
    } else {
      res.statusCode = 404;
      res.end();
    }
  } else {
    res.statusCode = 404;
    res.end();
  }
});
server.on('error', serverPromise.reject.bind(serverPromise));
server.listen(PREVIEW_PORT, PREVIEW_HOST, serverPromise.accept.bind(serverPromise));
})();

const _handlePreviewRequest = async (req, res) => {
  await serverPromise;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', '*');

  const u = url.parse(req.url, true);
  // console.log('preview 1', u);
  const {query} = u;
  const {hash, type, ext} = query;
  // console.log('preview 2', {hash, ext, type});
  if (hash && type && ext) {
    const key = `${hash}/${type}/${ext}`;
    const o = await (async () => {
      try {
        return await getObject(
          bucketNames.preview,
          key,
        );
      } catch(err) {
        // console.warn(err);
        return null;
      }
    })();
    if (o) {
      res.setHeader('Content-Type', o.ContentType || 'application/octet-stream');
      res.end(o.Body);
    } else {
      const p = _makePromise()
      const index = ++cbIndex;
      cbs[index] = p.accept.bind(p);

      // console.log('preview 3');
      const page = await browser.newPage();
      // console.log('preview 4');
      page.on('console', e => {
        console.log(e);
      });
      page.on('error', err => {
        console.log(err);
      });
      page.on('pageerror', err => {
        console.log(err);
      });
      // console.log('load 1', hash, ext, type);
      await page.goto(`https://app.webaverse.com/screenshot.html?hash=${hash}&ext=${ext}&type=${type}&dst=http://${PREVIEW_HOST}:${PREVIEW_PORT}/` + index);
      // console.log('load 2');

      const {req: proxyReq, res: proxyRes} = await p;

      // console.log('load 3');

      const contentType = proxyReq.headers['content-type'] || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      proxyReq.pipe(res);

      const bs = [];
      proxyReq.on('data', d => {
        bs.push(d);
      });
      await new Promise((accept, reject) => {
        proxyReq.on('end', accept);
      });
      proxyRes.end();
      page.close();

      const b = Buffer.concat(bs);
      bs.length = 0;
      await putObject(
        bucketNames.preview,
        key,
        b,
        contentType,
      );
    }
  } else {
    res.statusCode = 404;
    res.end();
  }
};

module.exports = {
  _handlePreviewRequest,
}