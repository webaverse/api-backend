require("dotenv").config();
const fs = require("fs");
const url = require("url");
const http = require("http");
const https = require("https");
const httpProxy = require("http-proxy");
const ws = require("ws");

const { getBlockchain } = require("./blockchain.js");

const gotNfts = require("got-nfts");

const {
  _handleAi
} = require('./routes/ai.js');


const {
  worldManager,
} = require("./routes/worlds.js");

const { _handleSignRequest } = require("./routes/sign.js");

const {
  _handleLogin,
  _handleOauth
} = require('./routes/login');

const {
  _handleAccounts
} = require('./routes/accounts');

const {
  _handleProfile
} = require('./routes/profile');

const {
  _handleTokens
} = require('./routes/tokens');

const {
  _handleUnlockRequest,
  _handleLockRequest,
  _handleDecryptRequest,
} = require("./routes/unlock.js");
const { _handleAnalyticsRequest } = require("./routes/analytics.js");

let CERT = null;
let PRIVKEY = null;

const fullchainPath = "./certs/fullchain.pem";
const privkeyPath = "./certs/privkey.pem";
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
Error.stackTraceLimit = 300;

(async () => {
  await worldManager.waitForLoad();

  const _handleEthereum = (port) => async (req, res) => {
    // XXX make this per-port
    const _respond = (statusCode, body) => {
      res.statusCode = statusCode;
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.end(body);
    };
    const _setCorsHeaders = (res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "*");
      res.setHeader("Access-Control-Allow-Methods", "*");
    };

    try {
      const { gethNodeUrl } = await getBlockchain();

      const proxy = httpProxy.createProxyServer({});
      proxy.web(
        req,
        res,
        {
          target: gethNodeUrl + ":" + port,
          // secure: false,
          changeOrigin: true,
        },
        (err) => {
          console.warn(err.stack);

          res.statusCode = 500;
          res.end();
        }
      );
    } catch (err) {
      console.warn(err);

      _respond(
        500,
        JSON.stringify({
          error: err.stack,
        })
      );
    }
  };


  const _handleProxyRoot = (() => {
    const proxy = httpProxy.createProxyServer({});

    proxy.on("error", (err) => {
      console.warn(err.stack);
    });
    return (req, res) => {
      proxy.web(
        req,
        res,
        {
          target: "https://webaverse.com",
          // secure: false,
          changeOrigin: true,
        },
        (err) => {
          console.warn(err.stack);

          res.statusCode = 500;
          res.end();
        }
      );
    };
  })();

  const _handleProxyApp = (() => {
    const proxy = httpProxy.createProxyServer({});

    proxy.on("error", (err) => {
      console.warn(err.stack);
    });
    return (req, res) => {
      proxy.web(
        req,
        res,
        {
          target: "https://app.webaverse.com",
          // secure: false,
          changeOrigin: true,
        },
        (err) => {
          console.warn(err.stack);

          res.statusCode = 500;
          res.end();
        }
      );
    };
  })();

  const _handleLand = (tokenBName) => (req, res) => {
    const _respond = (statusCode, body) => {
      res.statusCode = statusCode;
      _setCorsHeaders(res);
      res.end(body);
    };
    const _setCorsHeaders = (res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "*");
      res.setHeader("Access-Control-Allow-Methods", "*");
    };
    _respond(200, JSON.stringify([]));
  };
  const _handleGraph = async (req, res) => {
    const _respond = (statusCode, body) => {
      res.statusCode = statusCode;
      _setCorsHeaders(res);
      res.end(body);
    };
    const _setCorsHeaders = (res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "*");
      res.setHeader("Access-Control-Allow-Methods", "*");
    };

    try {
      const { method } = req;

      if (method === "GET") {
        const { pathname: p } = url.parse(req.url, true);
        let match;
        if ((match = p.match(/^\/accounts\/(0x[0-9a-f]+)$/i))) {
          const accountAddress = match[1];
          const metadata = await gotNfts.fetchNftsMetadata(accountAddress);

          _setCorsHeaders(res);
          _respond(200, JSON.stringify(metadata));
        } else if ((match = p.match(/^\/tokens\/(0x[0-9a-f]+)\/([0-9]+)$/i))) {
          const contractAddress = match[1];
          const tokenId = parseInt(match[2], 10);
          const metadata = await gotNfts.fetchNftMetadata(
            contractAddress,
            tokenId
          );

          _setCorsHeaders(res);
          _respond(200, JSON.stringify(metadata));
        } else {
          _respond(404, "not found");
        }
      } else {
        _respond(404, "not found");
      }
    } catch (err) {
      console.warn(err);

      _respond(
        500,
        JSON.stringify({
          error: err.stack,
        })
      );
    }
  };

  const _handleStore = (chainName) => async (req, res) => {
    const _respond = (statusCode, body) => {
      res.statusCode = statusCode;
      _setCorsHeaders(res);
      res.end(body);
    };
    const _setCorsHeaders = (res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "*");
      res.setHeader("Access-Control-Allow-Methods", "*");
    };
    _respond(200, JSON.stringify([]));
  };

  const proxy = httpProxy.createProxyServer({});
  proxy.on("proxyRes", (proxyRes, req) => {
    if (proxyRes.headers["location"]) {
      const o = new url.URL(proxyRes.headers["location"], req.url);
      o.host = o.host.replace("-", "--");
      o.host =
        o.protocol.slice(0, -1) +
        "-" +
        o.host.replace(/\./g, "-").replace(/:([0-9]+)$/, "-$1") +
        ".proxy.webaverse.com";
      o.protocol = "https:";
      proxyRes.headers["location"] = o.href;
    }
    proxyRes.headers["access-control-allow-origin"] = "*";
    delete proxyRes.headers["x-frame-options"];
    delete proxyRes.headers["content-security-policy"];
    delete proxyRes.headers["x-xss-protection"];
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

      if (o.host === "login.webaverse.com") {
        _handleLogin(req, res);
        return;
      } else if (o.host === "mainnetsidechain.exokit.org") {
        _handleEthereum(8545)(req, res);
        return;
      } else if (o.host === "testnetsidechain.exokit.org") {
        _handleEthereum(8546)(req, res);
        return;
      } else if (
        o.host === "accounts.webaverse.com" ||
        o.host === "mainnetsidechain-accounts.webaverse.com"
      ) {
        _handleAccounts("mainnetsidechain")(req, res);
        return;
      } else if (o.host === "testnetsidechain-accounts.webaverse.com") {
        _handleAccounts("testnetsidechain")(req, res);
        return;
      } else if (o.host === "analytics.webaverse.com") {
        _handleAnalyticsRequest(req, res);
        return;
      } else if (o.host === "sign.exokit.org") {
        _handleSignRequest(req, res);
        return;
      } else if (o.host === "unlock.exokit.org") {
        _handleUnlockRequest(req, res);
        return;
      } else if (o.host === "lock.exokit.org") {
        _handleLockRequest(req, res);
        return;
      } else if (o.host === "decrypt.exokit.org") {
        _handleDecryptRequest(req, res);
        return;
      } else if (o.host === "oauth.exokit.org") {
        _handleOauth(req, res);
        return;
      } else if (
        o.host === "profile.webaverse.com" ||
        o.host === "mainnetsidechain-profile.webaverse.com"
      ) {
        _handleProfile('mainnetsidechain')(req, res);
        return;
      } else if (o.host === "testnetsidechain-profile.webaverse.com") {
        _handleProfile('testnetsidechain')(req, res);
        return;
      } else if (
        o.host === "main.webaverse.com" ||
        o.host === "test.webaverse.com"
      ) {
        _handleProxyRoot(req, res);
        return;
      } else if (
        o.host === "main.app.webaverse.com" ||
        o.host === "test.app.webaverse.com"
      ) {
        _handleProxyApp(req, res);
        return;
      } else if (o.host === "mainnet-tokens.webaverse.com") {
        _handleTokens("mainnet", false)(req, res);
        return;
      } else if (
        o.host === "tokensall.webaverse.com" ||
        o.host === "mainnetall-tokens.webaverse.com"
      ) {
        _handleTokens("mainnet", true)(req, res);
        return;
      } else if (
        o.host === "tokens.webaverse.com" ||
        o.host === "mainnetsidechain-tokens.webaverse.com"
      ) {
        _handleTokens("mainnetsidechain", false)(req, res);
        return;
      } else if (o.host === "polygon-tokens.webaverse.com") {
        _handleTokens("polygon", false)(req, res);
        return;
      } else if (
        o.host === "tokensall.webaverse.com" ||
        o.host === "polygonall-tokens.webaverse.com"
      ) {
        _handleTokens("polygon", true)(req, res);
        return;
      } else if (o.host === "testnet-tokens.webaverse.com") {
        _handleTokens("testnet", true)(req, res);
        return;
      } else if (o.host === "testnetall-tokens.webaverse.com") {
        _handleTokens("testnet", true)(req, res);
        return;
      } else if (o.host === "testnetpolygon-tokens.webaverse.com") {
        _handleTokens("testnetpolygon", true)(req, res);
        return;
      } else if (o.host === "testnetpolygonall-tokens.webaverse.com") {
        _handleTokens("testnetpolygon", true)(req, res);
        return;
      } else if (o.host === "testnetsidechain-tokens.webaverse.com") {
        _handleTokens("testnetsidechain", false)(req, res);
        return;
      } else if (o.host === "mainnet-land.webaverse.com") {
        _handleLand("mainnet")(req, res);
        return;
      } else if (o.host === "polygon-land.webaverse.com") {
        _handleLand("polygon")(req, res);
        return;
      } else if (
        o.host === "land.webaverse.com" ||
        o.host === "mainnetsidechain-land.webaverse.com"
      ) {
        _handleLand("mainnetsidechain")(req, res);
        return;
      } else if (o.host === "testnet-land.webaverse.com") {
        _handleLand("testnet")(req, res);
        return;
      } else if (o.host === "testnetsidechain-land.webaverse.com") {
        _handleLand("testnetsidechain")(req, res);
        return;
      } else if (o.host === "testnetpolygon-land.webaverse.com") {
        _handleLand("testnetpolygon")(req, res);
        return;
      } else if (o.host === "graph.webaverse.com") {
        _handleGraph(req, res);
        return;
      } else if (
        o.host === "store.webaverse.com" ||
        o.host === "mainnetsidechain-store.webaverse.com"
      ) {
        _handleStore("mainnet")(req, res);
        return;
      } else if (o.host === "testnetsidechain-store.webaverse.com") {
        _handleStore("sidechain")(req, res);
        return;
      } else if (o.host === "ai.exokit.org" || o.host === "ai.webaverse.com") {
        _handleAi(req, res);
        return;
      }

      if (
        (match = o.host.match(/^(.+)\.proxy\.(?:webaverse\.com|exokit\.org)$/))
      ) {
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
            const oldUrl = req.url;
            req.url = url.format(o);

            // console.log(oldUrl, '->', req.url);

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
      if (
        (match = o.host.match(/^(.+)\.proxy\.(?:webaverse\.com|exokit\.org)$/))
      ) {
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

  server.listen(PORT);
  server2.listen(443);

  console.log(`http://127.0.0.1:${PORT}`);
  console.log(`https://127.0.0.1:443`);
})();
