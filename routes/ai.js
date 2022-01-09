const url = require("url");
const https = require("https");

const OpenAI = require("openai-api");
const GPT3Encoder = require("gpt-3-encoder");

let config = require("../config.json");

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

      if (s.trim().length === 0) {
        return _respond(400, "Empty request body");
      }

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


module.exports = {
  _handleAi,
};