Error.stackTraceLimit = 300;

require('dotenv-flow').config();
const fs = require("fs");
const url = require("url");
const http = require("http");
const https = require("https");
const httpProxy = require("http-proxy");
const ws = require("ws");

const {
  handleLogin,
  handleEthereum,
  handleAccounts,
  handleOauth,
  handleProfile,
  handleProxyRoot,
  handleProxyApp,
  handleTokens,
  handleLand,
  handleStore,
} = require("./handlers.js");

const ethereumJsUtil = require('./ethereumjs-util.js');

const {HTTP_PORT, HTTPS_PORT} = require('../constants.js');
const {tryConnectRedis} = require ('../redis.js');
// Routes
const {worldManager, handleWorldsRequest} = require("./routes/worlds.js");
const {handleSignRequest} = require("./routes/sign.js");
const {handleUnlockRequest, handleLockRequest, handleDecryptRequest} = require("./routes/unlock.js");
const {handleAnalyticsRequest} = require("./routes/analytics.js");

let CERT = null;
let PRIVKEY = null;
const fullchainPath = "../../certs/fullchain.pem";
const privkeyPath = "../../certs/privkey.pem";

try {
  CERT = fs.readFileSync(fullchainPath);
  PRIVKEY = fs.readFileSync(privkeyPath);
} catch (err) {
  console.warn(`failed to load certs, do you have .pem files in a certs folder at root?`);
}

(async () => {
  await worldManager.waitForLoad();

  tryConnectRedis();

  const proxy = httpProxy.createProxyServer({});
  proxy.on("proxyRes", (proxyRes, req) => {
    if (proxyRes.headers["location"]) {
      const o = new url.URL(proxyRes.headers["location"], req.url);
      o.host = o.host.replace("-", "--");
      o.host =
        o.protocol.slice(0, -1) +
        "-" +
        o.host.replace(/\./g, "-").replace(/:([0-9]+)$/, "-$1") +
        ".proxy.exokit.org";
      o.protocol = "https:";
      proxyRes.headers["location"] = o.href;
    }
    proxyRes.headers["access-control-allow-origin"] = "*";
  });
  proxy.on("error", (err) => {
    console.warn(err.stack);
  });

  const presenceWss = new ws.Server({
    noServer: true,
  });

  const _req = (protocol) => (req, res) => {
    try {
      const o = url.parse(
        protocol + "//" + (req.headers["host"] || "") + req.url
      );
      let match;
      if (o.host === "login.exokit.org") {
        handleLogin(req, res);
        return;
      } else if (o.host === "mainnetsidechain.exokit.org") {
        handleEthereum(8545)(req, res);
        return;
      } else if (o.host === "testnetsidechain.exokit.org") {
        handleEthereum(8546)(req, res);
        return;
      } else if (
        o.host === "accounts.webaverse.com" ||
        o.host === "mainnetsidechain-accounts.webaverse.com"
      ) {
        handleAccounts()(req, res);
        return;
      } else if (o.host === "testnetsidechain-accounts.webaverse.com") {
        handleAccounts()(req, res);
        return;
      } else if (o.host === "analytics.webaverse.com") {
        handleAnalyticsRequest(req, res);
        return;
      } else if (o.host === "sign.exokit.org") {
        handleSignRequest(req, res);
        return;
      } else if (o.host === "unlock.exokit.org") {
        handleUnlockRequest(req, res);
        return;
      } else if (o.host === 'lock.exokit.org') {
        handleLockRequest(req, res);
        return;
      } else if (o.host === 'decrypt.exokit.org') {
        handleDecryptRequest(req, res);
        return;
      } else if (o.host === "oauth.exokit.org") {
        handleOauth(req, res);
        return;
      } else if (
        o.host === "profile.webaverse.com" ||
        o.host === "mainnetsidechain-profile.webaverse.com"
      ) {
        handleProfile(true)(req, res);
        return;
      } else if (o.host === "testnetsidechain-profile.webaverse.com") {
        handleProfile(false)(req, res);
        return;
      } else if (
        o.host === "main.webaverse.com" ||
        o.host === "test.webaverse.com"
      ) {
        handleProxyRoot(req, res);
        return;
      } else if (
        o.host === "main.app.webaverse.com" ||
        o.host === "test.app.webaverse.com"
      ) {
        handleProxyApp(req, res);
        return;
      } else if (o.host === "mainnet-tokens.webaverse.com") {
        handleTokens("mainnet", false)(req, res);
        return;
      } else if (
        o.host === "tokensall.webaverse.com" ||
        o.host === "mainnetall-tokens.webaverse.com"
      ) {
        handleTokens("mainnet", true)(req, res);
        return;
      } else if (
        o.host === "tokens.webaverse.com" ||
        o.host === "mainnetsidechain-tokens.webaverse.com"
      ) {
        handleTokens("mainnetsidechain", false)(req, res);
        return;
      } else if (o.host === "polygon-tokens.webaverse.com") {
        handleTokens("polygon", false)(req, res);
        return;
      } else if (
        o.host === "tokensall.webaverse.com" ||
        o.host === "polygonall-tokens.webaverse.com"
      ) {
        handleTokens("polygon", true)(req, res);
        return;
      } else if (o.host === "testnet-tokens.webaverse.com") {
        handleTokens("testnet", true)(req, res);
        return;
      } else if (o.host === "testnetall-tokens.webaverse.com") {
        handleTokens("testnet", true)(req, res);
        return;
      } else if (o.host === "testnetpolygon-tokens.webaverse.com") {
        handleTokens("testnetpolygon", true)(req, res);
        return;
      } else if (o.host === "testnetpolygonall-tokens.webaverse.com") {
        handleTokens("testnetpolygon", true)(req, res);
        return;
      } else if (o.host === "testnetsidechain-tokens.webaverse.com") {
        handleTokens("testnetsidechain", false)(req, res);
        return;
      } else if (o.host === "mainnet-land.webaverse.com") {
        handleLand("mainnet", true)(req, res);
        return;
      } else if (o.host === "polygon-land.webaverse.com") {
        handleLand("polygon", true)(req, res);
        return;
      } else if (
        o.host === "land.webaverse.com" ||
        o.host === "mainnetsidechain-land.webaverse.com"
      ) {
        handleLand("mainnetsidechain", false)(req, res);
        return;
      } else if (o.host === "testnet-land.webaverse.com") {
        handleLand("testnet", true)(req, res);
        return;
      } else if (o.host === "testnetsidechain-land.webaverse.com") {
        handleLand("testnetsidechain", false)(req, res);
        return;
      } else if (o.host === "testnetpolygon-land.webaverse.com") {
        handleLand("testnetpolygon", false)(req, res);
        return;
      } else if (o.host === "worlds.exokit.org") {
        handleWorldsRequest(req, res);
        return;
      } else if (
        o.host === "store.webaverse.com" ||
        o.host === "mainnetsidechain-store.webaverse.com"
      ) {
        handleStore("mainnet")(req, res);
        return;
      } else if (o.host === "testnetsidechain-store.webaverse.com") {
        handleStore("sidechain")(req, res);
        return;
      }

      if ((match = o.host.match(/^(.+)\.proxy\.exokit.org$/))) {
        const raw = match[1];
        const match2 = raw.match(/^(https?-)(.+?)(-[0-9]+)?$/);
        if (match2) {
          if (req.method === "OPTIONS") {
            // res.statusCode = 200;
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Methods", "*");
            res.setHeader("Access-Control-Allow-Headers", "*");
            res.end();
          } else {
            o.protocol = match2[1].replace(/-/g, ":");
            o.host =
              match2[2]
                .replace(/--/g, "=")
                .replace(/-/g, ".")
                .replace(/=/g, "-")
                .replace(/\.\./g, "-") +
              (match2[3] ? match2[3].replace(/-/g, ":") : "");
            req.url = url.format(o);

            req.headers["user-agent"] = "curl/1";
            delete req.headers["origin"];
            delete req.headers["referer"];

            proxy.web(
              req,
              res,
              {
                target: o.protocol + "//" + o.host,
                secure: false,
                changeOrigin: true,
              },
              (err) => {
                console.warn(err.stack);

                res.statusCode = 500;
                res.end();
              }
            );
          }
          return;
        }
      }

      res.statusCode = 404;
      res.end("host not found");
    } catch (err) {
      console.warn(err.stack);

      res.statusCode = 500;
      res.end(err.stack);
    }
  };

  const _ws = (protocol) => (req, socket, head) => {
    const host = req.headers["host"];
    if (host === "events.exokit.org") {
      presenceWss.handleUpgrade(req, socket, head, (s) => {
        presenceWss.emit("connection", s, req);
      });
    } else {
      const o = url.parse(
        protocol + "//" + (req.headers["host"] || "") + req.url
      );
      console.log("got", protocol, req.headers["host"], req.url, o);
      let match;
      if ((match = o.host.match(/^(.+)\.proxy\.exokit.org$/))) {
        const raw = match[1];
        const match2 = raw.match(/^(https?-)(.+?)(-[0-9]+)?$/);
        console.log("match 2", raw, match2);
        if (match2) {
          const hostname =
            match2[2]
              .replace(/--/g, "=")
              .replace(/-/g, ".")
              .replace(/=/g, "-")
              .replace(/\.\./g, "-") +
            (match2[3] ? match2[3].replace(/-/g, ":") : "");
          const host = "wss://" + hostname;
          req.headers["host"] = hostname;
          req.headers["origin"] = "https://hubs.mozilla.com";
          delete req.headers["referer"];

          console.log("redirect", [host, req.url, req.headers]);

          proxy.ws(req, socket, head, {
            target: host,
          });
          return;
        }
      }

      socket.destroy();
    }
  };

  const server = http.createServer(_req("http:"));
  server.on("upgrade", _ws("http:"));
  const server2 = https.createServer(
    {
      cert: CERT,
      key: PRIVKEY,
    },
    _req("https:")
  );
  server2.on("upgrade", _ws("https:"));

  const _warn = (err) => {
    console.warn("uncaught: " + err.stack);
  };
  process.on("uncaughtException", _warn);
  process.on("unhandledRejection", _warn);

  server.listen(HTTP_PORT);
  server2.listen(HTTPS_PORT);

  console.log(`http://127.0.0.1:${HTTP_PORT}`);
  console.log(`https://127.0.0.1:${HTTPS_PORT}`);
})();
