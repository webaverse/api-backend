// @ts-check
require("dotenv").config();
const fs = require("fs");
const url = require("url");
const http = require("http");
const https = require("https");
const httpProxy = require("http-proxy");
const ws = require("ws");
const fetch = require("node-fetch");
const {
  getRedisItem,
} = require("./redis.js");
const {
  getStoreEntries,
  getChainNft,
  getAllWithdrawsDeposits,
} = require("./tokens.js");
const { getBlockchain } = require("./blockchain.js");

const {
  redisPrefixes,
  cacheHostUrl,
} = require("./constants.js");

const { connect: redisConnect, getRedisClient } = require("./redis");
const gotNfts = require("got-nfts");
const OpenAI = require("openai-api");
const GPT3Encoder = require("gpt-3-encoder");
const Web3 = require("web3");

let config = fs.existsSync("./config.json") ? require("./config.json") : null;

const getAiPrefix = (() => {
  let aiPrefix = null;
  let aiPrefixLoad = null;
  return async () => {
    if (aiPrefix) {
      return aiPrefix;
    } else {
      if (!aiPrefixLoad) {
        aiPrefixLoad = (async () => {
          const res = await fetch(
            `https://webaverse.github.io/app/ai/ai-prefix.js`
          );
          const text = await res.text();
          return text;
        })();
        aiPrefixLoad.then((text) => {
          aiPrefix = text;
          aiPrefixLoad = null;
          setTimeout(() => {
            aiPrefix = null;
          }, 60 * 1000);
        });
      }
      return await aiPrefixLoad;
    }
  };
})();

OpenAI.prototype._send_request = ((sendRequest) =>
  async function (url, method, opts = {}) {
    let camelToUnderscore = (key) => {
      let result = key.replace(/([A-Z])/g, " $1");
      return result.split(" ").join("_").toLowerCase();
    };

    const data = {};
    for (const key in opts) {
      data[camelToUnderscore(key)] = opts[key];
    }

    const rs = await new Promise((accept, reject) => {
      const req = https.request(
        url,
        {
          method,
          headers: {
            Authorization: `Bearer ${this._api_key}`,
            "Content-Type": "application/json",
          },
        },
        (res) => {
          res.setEncoding("utf8");
          accept(res);
        }
      );
      req.end(Object.keys(data).length ? JSON.stringify(data) : "");
      req.on("error", reject);
    });
    return rs;
  })(OpenAI.prototype._send_request);
const openai = new OpenAI(config.openAiKey);
const _openAiCodex = async (prompt, stop) => {
  const maxTokens = 4096;
  const max_tokens = maxTokens - GPT3Encoder.encode(prompt).length;
  console.log("max tokens: " + max_tokens);
  const gptRes = await openai.complete({
    engine: "davinci-codex",
    prompt,
    stop,
    temperature: 0,
    topP: 1,
    max_tokens,
    stream: true,
  });
  return gptRes;
};

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

    try {
      const { method } = req;
      const { pathname: p } = url.parse(req.url);

      const _getBooths = async () => {
        const storeEntries = await getStoreEntries(chainName);

        const booths = [];
        for (let i = 0; i < storeEntries.length; i++) {
          const store = storeEntries[i];
          const { tokenId, seller } = store;

          if (tokenId) {
            const token = await getChainToken(chainName)(tokenId, storeEntries);

            let booth = booths.find((booth) => booth.seller === seller);
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
      if ((method === "GET") & (p === "/")) {
        const booths = await _getBooths();
        _respond(200, JSON.stringify(booths));
      } else if ((match = p.match(/^\/(0x[a-f0-9]+)$/i))) {
        const seller = match[1];
        let booths = await _getBooths();
        booths = booths.filter((booth) => booth.seller === seller);
        _respond(200, JSON.stringify(booths));
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

  const _handleAi = async (req, res) => {
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
      const o = url.parse(req.url, true);
      const { pathname: p } = o;

      // console.log('got ai hit', req.method, o, req.headers);

      if (req.method === "OPTIONS") {
        _setCorsHeaders(res);
        res.end();
      } else if (
        req.method === "POST" &&
        p === "/" &&
        req.headers["authorization"] === "Password " + config.devPassword
      ) {
        _setCorsHeaders(res);

        const b = await new Promise((accept, reject) => {
          const bs = [];
          req.on("data", (d) => {
            bs.push(d);
          });
          req.on("end", () => {
            const b = Buffer.concat(bs);
            bs.length = 0;
            accept(b);
          });
          req.on("error", reject);
        });
        const s = b.toString("utf8");
        const o = JSON.parse(s);

        console.log("got o", o);

        const gptResponse = await openai.complete({
          engine: "davinci",
          // stream: false,
          prompt: o.prompt, // 'this is a test',
          maxTokens: o.maxTokens, // 5,
          temperature: o.temperature, // 0.9,
          topP: o.topP, // 1,
          presencePenalty: o.presencePenalty, // 0,
          frequencyPenalty: o.frequencyPenalty, // 0,
          bestOf: o.bestOf, // 1,
          n: o.n, // 1,
          stop: o.stop, // ['\n']
        });

        console.log("got response");
        console.log(gptResponse.data);

        res.end(JSON.stringify(gptResponse.data));
      } else if (req.method === "GET" && p === "/code") {
        _setCorsHeaders(res);

        const aiPrefix = await getAiPrefix();

        const p = decodeURIComponent(o.query.p);
        console.log("run query", { aiPrefix, p });
        const maxChars = 256;
        if (p.length <= maxChars) {
          const proxyRes = await _openAiCodex(
            aiPrefix + p + " */\n",
            "\n/* Command: "
          );
          if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
            for (const key in proxyRes.headers) {
              const value = proxyRes.headers[key];
              res.setHeader(key, value);
            }
            // console.log('render');
            proxyRes.pipe(res);
            proxyRes.on("data", (d) => {
              console.log("got data", d.toString("utf8"));
            });
          } else {
            proxyRes.setEncoding("utf8");
            proxyRes.on("data", (s) => {
              console.log(s);
            });
            res.setHeader("Content-Type", "text/event-stream");
            res.end("data: [DONE]");
          }
        } else {
          _respond(
            400,
            JSON.stringify({
              error: `prompt length exceeded (max=${maxChars} submitted=${p.length})`,
            })
          );
        }
      } else {
        _respond(
          403,
          JSON.stringify({
            error: "invalid password",
          })
        );
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

  let redisClient = null;
  const _tryConnectRedis = () => {
    redisConnect(undefined, cacheHostUrl)
      .then(() => {
        redisClient = getRedisClient();
        console.log("connected to redis");
      })
      .catch((err) => {
        console.warn("failed to connect to redis, retrying", err);
        setTimeout(_tryConnectRedis, 1000);
      });
  };
  _tryConnectRedis();

  const proxy = httpProxy.createProxyServer({});
  proxy.on("proxyRes", (proxyRes, req) => {
    if (proxyRes.headers["location"]) {
      const o = new url.URL(proxyRes.headers["location"], req.url);
      // console.log('redirect location 1', req.url, proxyRes.headers['location'], o.href);
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
        _handleLand("mainnet", true)(req, res);
        return;
      } else if (o.host === "polygon-land.webaverse.com") {
        _handleLand("polygon", true)(req, res);
        return;
      } else if (
        o.host === "land.webaverse.com" ||
        o.host === "mainnetsidechain-land.webaverse.com"
      ) {
        _handleLand("mainnetsidechain", false)(req, res);
        return;
      } else if (o.host === "testnet-land.webaverse.com") {
        _handleLand("testnet", true)(req, res);
        return;
      } else if (o.host === "testnetsidechain-land.webaverse.com") {
        _handleLand("testnetsidechain", false)(req, res);
        return;
      } else if (o.host === "testnetpolygon-land.webaverse.com") {
        _handleLand("testnetpolygon", false)(req, res);
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
