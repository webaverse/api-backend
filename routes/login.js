const url = require("url");
const AWS = require("aws-sdk");
const crypto = require("crypto");
const bip39 = require("bip39");
const { hdkey } = require("ethereumjs-wallet");
const https = require("https");
const { default: formurlencoded } = require("form-urlencoded");

const namegen = require("../namegen.js");
const ethereumJsUtil = require("../ethereumjs-util.js");

let config = require("../config.json");

const accessKeyId = process.env.accessKeyId || config.accessKeyId;
const secretAccessKey = process.env.secretAccessKey || config.secretAccessKey;
const githubClientId = process.env.githubClientId || config.githubClientId;
const githubClientSecret =
  process.env.githubClientSecret || config.githubClientSecret;
const discordClientId = process.env.discordClientId || config.discordClientId;
const discordClientSecret =
  process.env.discordClientSecret || config.discordClientSecret;

const awsConfig = new AWS.Config({
  credentials: new AWS.Credentials({
    accessKeyId,
    secretAccessKey,
  }),
  region: "us-west-1",
});
const ddb = new AWS.DynamoDB(awsConfig);
const ses = new AWS.SES(
  new AWS.Config({
    credentials: new AWS.Credentials({
      accessKeyId,
      secretAccessKey,
    }),
    region: "us-west-2",
  })
);

const maxEmailsPerIp = 5;
const maxEmailsRefillTime = 10 * 60 * 1000;
class Throttler {
  constructor() {
    this.tickets = {};
  }
  getTicket(ip) {
    this.tickets[ip] ||= 0;
    if (this.tickets[ip] < maxEmailsPerIp) {
      this.tickets[ip]++;
      setTimeout(() => {
        this.tickets[ip]--;
      }, maxEmailsRefillTime);
      return true;
    } else {
      return false;
    }
  }
}
const throttler = new Throttler();

function _randomString() {
  return Math.random()
    .toString(36)
    .replace(/[^a-z]+/g, "")
    .substr(0, 5);
}

const tableName = "users";

const emailRegex =
  /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/;
const codeTestRegex = /^[0-9]{6}$/;
const discordIdTestRegex = /^[0-9]+$/;
const twitterIdTestRegex = /^@?(\w){1,15}$/;

const _handleLogin = async (req, res) => {
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
    const { method } = req;
    const { query, pathname: p } = url.parse(req.url, true);

    console.log("got login", JSON.stringify({ method, p, query }, null, 2));

    if (method === "POST") {
      let {
        email,
        code,
        token,
        discordcode,
        discordid,
        twittercode,
        twitterid,
        autoip,
        mnemonic,
        signature,
        nonce,
        redirect_uri,
      } = query;
      if (email && emailRegex.test(email)) {
        if (token) {
          const tokenItem = await ddb
            .getItem({
              TableName: tableName,
              Key: {
                email: { S: email + ".token" },
              },
            })
            .promise();

          console.log("got login", tokenItem, { email, token });

          const tokens = tokenItem.Item
            ? JSON.parse(tokenItem.Item.tokens.S)
            : [];
          if (tokens.includes(token)) {
            _respond(
              200,
              JSON.stringify({
                email,
                token,
                name: tokenItem.Item.name.S,
                mnemonic: tokenItem.Item.mnemonic.S,
                addr: tokenItem.Item.addr.S,
                state: tokenItem.Item.state.S,
                stripeState:
                  tokenItem.Item.stripeState && tokenItem.Item.stripeState.S
                    ? !!JSON.parse(tokenItem.Item.stripeState.S)
                    : false,
                stripeConnectState:
                  tokenItem.Item.stripeConnectState &&
                    tokenItem.Item.stripeConnectState.S
                    ? !!JSON.parse(tokenItem.Item.stripeConnectState.S)
                    : false,
                githubOauthState:
                  tokenItem.Item.githubOauthState &&
                    tokenItem.Item.githubOauthState.S
                    ? !!JSON.parse(tokenItem.Item.githubOauthState.S)
                    : false,
              })
            );
          } else {
            _respond(
              401,
              JSON.stringify({
                error: "invalid token",
              })
            );
          }
        } else if (code) {
          if (codeTestRegex.test(code)) {
            const codeItem = await ddb
              .getItem({
                TableName: tableName,
                Key: {
                  email: { S: email + ".code" },
                },
              })
              .promise();

            console.log("got verification", codeItem, { email, code });

            if (codeItem.Item && codeItem.Item.code.S === code) {
              await ddb
                .deleteItem({
                  TableName: tableName,
                  Key: {
                    email: { S: email + ".code" },
                  },
                })
                .promise();

              const tokenItem = await ddb
                .getItem({
                  TableName: tableName,
                  Key: {
                    email: { S: email + ".token" },
                  },
                })
                .promise();
              const tokens =
                tokenItem.Item && tokenItem.Item.tokens
                  ? JSON.parse(tokenItem.Item.tokens.S)
                  : [];
              let name =
                tokenItem.Item && tokenItem.Item.name
                  ? tokenItem.Item.name.S
                  : null;
              let mnemonic =
                tokenItem.Item && tokenItem.Item.mnemonic
                  ? tokenItem.Item.mnemonic.S
                  : null;
              let addr =
                tokenItem.Item && tokenItem.Item.addr
                  ? tokenItem.Item.addr.S
                  : null;
              let state =
                tokenItem.Item && tokenItem.Item.state
                  ? tokenItem.Item.state.S
                  : null;
              let stripeState =
                tokenItem.Item && tokenItem.Item.stripeState
                  ? JSON.parse(tokenItem.Item.stripeState.S)
                  : null;
              let stripeConnectState =
                tokenItem.Item && tokenItem.Item.stripeConnectState
                  ? JSON.parse(tokenItem.Item.stripeConnectState.S)
                  : null;
              let githubOauthState =
                tokenItem.Item && tokenItem.Item.githubOauthState
                  ? JSON.parse(tokenItem.Item.githubOauthState.S)
                  : null;

              // console.log('old item', tokenItem, {tokens, mnemonic});

              const token = crypto.randomBytes(32).toString("base64");
              tokens.push(token);
              while (tokens.length > 10) {
                tokens.shift();
              }
              if (!name) {
                name = namegen(2).join("-");
              }
              if (!mnemonic || !addr) {
                mnemonic = bip39.generateMnemonic();
                const wallet = hdkey
                  .fromMasterSeed(bip39.mnemonicToSeedSync(mnemonic))
                  .derivePath(`m/44'/60'/0'/0/0`)
                  .getWallet();
                addr = wallet.getAddressString();
              }
              if (!state) {
                state = _randomString();
              }
              if (!stripeState) {
                stripeState = null;
              }
              if (!stripeConnectState) {
                stripeConnectState = null;
              }
              if (!githubOauthState) {
                githubOauthState = null;
              }

              // console.log('new item', {name, tokens, mnemonic, addr});

              await ddb
                .putItem({
                  TableName: tableName,
                  Item: {
                    email: { S: email + ".token" },
                    name: { S: name },
                    tokens: { S: JSON.stringify(tokens) },
                    mnemonic: { S: mnemonic },
                    address: { S: addr },
                    addr: { S: addr },
                    state: { S: state },
                    stripeState: { S: JSON.stringify(stripeState) },
                    stripeConnectState: {
                      S: JSON.stringify(stripeConnectState),
                    },
                    githubOauthState: { S: JSON.stringify(githubOauthState) },
                    // whitelisted: {BOOL: true},
                  },
                })
                .promise();

              _respond(
                200,
                JSON.stringify({
                  email,
                  token,
                  name,
                  mnemonic,
                  addr,
                  state,
                  stripeState: !!stripeState,
                  stripeConnectState: !!stripeConnectState,
                  githubOauthState: !!githubOauthState,
                })
              );
            } else {
              _respond(
                403,
                JSON.stringify({
                  error: "invalid code",
                })
              );
            }
          } else {
            _respond(
              403,
              JSON.stringify({
                error: "invalid code",
              })
            );
          }
        } else {
          /* const tokenItem = await ddb.getItem({
          TableName: tableName,
          Key: {
            email: {S: email + '.token'},
          }
        }).promise();
        const whitelisted = tokenItem.Item ? tokenItem.Item.whitelisted.BOOL : false;
        console.log('whitelist', {email, whitelisted});
 
        if (whitelisted) { */

          const ok = throttler.getTicket(req.connection.remoteAddress);
          console.log(
            `login with email ${email} @ ${req.connection.remoteAddress} ${ok ? "OK" : "BLOCKED"
            }`
          );

          if (ok) {
            const code = new Uint32Array(crypto.randomBytes(4).buffer, 0, 1)
              .toString(10)
              .slice(-6);

            console.log("verification", { email, code });

            await ddb
              .putItem({
                TableName: tableName,
                Item: {
                  email: { S: email + ".code" },
                  code: { S: code },
                },
              })
              .promise();

            var params = {
              Destination: {
                ToAddresses: [email],
              },
              Message: {
                Body: {
                  Html: {
                    Data: `<h1>${code}</h1><h2><a href="https://webaverse.com/login.html?email=${encodeURIComponent(
                      email
                    )}&code=${encodeURIComponent(code)}">Log in</a></h2>`,
                  },
                },

                Subject: {
                  Data: `Verification code for Webaverse`,
                },
              },
              Source: "noreply@exokit.org",
            };

            const data = await ses.sendEmail(params).promise();

            console.log("got response", data);

            _respond(200, JSON.stringify({}));
          } else {
            _respond(429, JSON.stringify({}));
          }
          /* } else {
          _respond(403, JSON.stringify({
            error: 'email not whitelisted',
          }));
        } */
        }
      } else if (discordcode) {
        if (discordIdTestRegex.test(discordid)) {
          const codeItem = await ddb
            .getItem({
              TableName: tableName,
              Key: {
                email: { S: discordid + ".code" },
              },
            })
            .promise();

          console.log(
            "check item",
            discordid,
            JSON.stringify(codeItem.Item, null, 2)
          );

          if (codeItem.Item && codeItem.Item.code.S === discordcode) {
            await ddb
              .deleteItem({
                TableName: tableName,
                Key: {
                  email: { S: discordid + ".code" },
                },
              })
              .promise();

            // generate
            const tokenItem = await ddb
              .getItem({
                TableName: tableName,
                Key: {
                  email: { S: discordid + ".discordtoken" },
                },
              })
              .promise();
            const tokens =
              tokenItem.Item && tokenItem.Item.tokens
                ? JSON.parse(tokenItem.Item.tokens.S)
                : [];
            let name =
              tokenItem.Item && tokenItem.Item.name
                ? tokenItem.Item.name.S
                : null;
            let mnemonic =
              tokenItem.Item && tokenItem.Item.mnemonic
                ? tokenItem.Item.mnemonic.S
                : null;
            // let addr = (tokenItem.Item && tokenItem.Item.address) ? tokenItem.Item.address.S : null;

            // console.log('old item', tokenItem, {tokens, mnemonic});

            const token = crypto.randomBytes(32).toString("base64");
            tokens.push(token);
            while (tokens.length > 10) {
              tokens.shift();
            }
            if (!name) {
              name = namegen(2).join("-");
            }
            if (!mnemonic) {
              mnemonic = bip39.generateMnemonic();
              /* const wallet = hdkey.fromMasterSeed(bip39.mnemonicToSeedSync(mnemonic)).derivePath(`m/44'/60'/0'/0/0`).getWallet();
            addr = wallet.getAddressString(); */
            }

            await ddb
              .putItem({
                TableName: tableName,
                Item: {
                  email: { S: discordid + ".discordtoken" },
                  mnemonic: { S: mnemonic },
                  // address: {S: addr},
                },
              })
              .promise();

            // respond
            _setCorsHeaders(res);
            res.end(JSON.stringify({ mnemonic }));
          } else {
            _respond(
              403,
              JSON.stringify({
                error: "invalid code",
              })
            );
          }
        } else {
          const proxyReq = await https.request(
            {
              method: "POST",
              host: "discord.com",
              path: "/api/oauth2/token",
              headers: {
                // Accept: 'application/json',
                "Content-Type": "application/x-www-form-urlencoded",
                // 'User-Agent': 'exokit-server',
              },
            },
            async (proxyRes) => {
              const discordOauthState = await new Promise(
                (accept, reject) => {
                  const bs = [];
                  proxyRes.on("data", (b) => {
                    bs.push(b);
                  });
                  proxyRes.on("end", () => {
                    accept(JSON.parse(Buffer.concat(bs).toString("utf8")));
                  });
                  proxyRes.on("error", (err) => {
                    reject(err);
                  });
                }
              );
              const { access_token } = discordOauthState;

              const proxyReq2 = await https.request(
                {
                  host: "discord.com",
                  path: "/api/users/@me",
                  headers: {
                    Authorization: `Bearer ${access_token}`,
                  },
                },
                async (proxyRes2) => {
                  const j = await new Promise((accept, reject) => {
                    const bs = [];
                    proxyRes2.on("data", (b) => {
                      bs.push(b);
                    });
                    proxyRes2.on("end", () => {
                      accept(JSON.parse(Buffer.concat(bs).toString("utf8")));
                    });
                    proxyRes2.on("error", (err) => {
                      reject(err);
                    });
                  });
                  const { id } = j;

                  if (id) {
                    const _getUser = async (id) => {
                      const tokenItem = await ddb
                        .getItem({
                          TableName: tableName,
                          Key: {
                            email: { S: id + ".discordtoken" },
                          },
                        })
                        .promise();

                      let mnemonic =
                        tokenItem.Item && tokenItem.Item.mnemonic
                          ? tokenItem.Item.mnemonic.S
                          : null;
                      return { mnemonic };
                    };
                    const _genKey = async (id) => {
                      const mnemonic = bip39.generateMnemonic();
                      const wallet = hdkey
                        .fromMasterSeed(bip39.mnemonicToSeedSync(mnemonic))
                        .derivePath(`m/44'/60'/0'/0/0`)
                        .getWallet();
                      const address = wallet.getAddressString();

                      await ddb
                        .putItem({
                          TableName: tableName,
                          Item: {
                            email: { S: id + ".discordtoken" },
                            mnemonic: { S: mnemonic },
                            address: { S: address },
                          },
                        })
                        .promise();
                      return { mnemonic };
                    };

                    const user = (await _getUser(id)) || _genKey(id);
                    const { mnemonic } = user;

                    _setCorsHeaders(res);
                    res.end(JSON.stringify({ mnemonic }));
                  } else {
                    console.warn("discord oauth failed", j);
                    _respond(
                      403,
                      JSON.stringify({
                        error: "discord oauth failed",
                      })
                    );
                  }
                }
              );
              proxyReq2.end();
              proxyReq2.on("error", (err) => {
                _respond(
                  500,
                  JSON.stringify({
                    error: err.stack,
                  })
                );
              });
            }
          );
          const s = formurlencoded({
            client_id: discordClientId,
            client_secret: discordClientSecret,
            code: discordcode,
            grant_type: "authorization_code",
            scope: "identify",
            redirect_uri: redirect_uri || "https://webaverse.com/login",
          });
          proxyReq.end(s);
          proxyReq.on("error", (err) => {
            _respond(
              500,
              JSON.stringify({
                error: err.stack,
              })
            );
          });
        }
      } else if (twittercode) {
        if (twitterIdTestRegex.test(twitterid)) {
          const codeItem = await ddb
            .getItem({
              TableName: tableName,
              Key: {
                email: { S: twitterid + ".code" },
              },
            })
            .promise();

          console.log(
            "check item",
            twitterid,
            JSON.stringify(codeItem.Item, null, 2)
          );

          if (codeItem.Item && codeItem.Item.code.S === twittercode) {
            await ddb
              .deleteItem({
                TableName: tableName,
                Key: {
                  email: { S: twitterid + ".code" },
                },
              })
              .promise();

            // generate
            const tokenItem = await ddb
              .getItem({
                TableName: tableName,
                Key: {
                  email: { S: twitterid + ".twittertoken" },
                },
              })
              .promise();
            const tokens =
              tokenItem.Item && tokenItem.Item.tokens
                ? JSON.parse(tokenItem.Item.tokens.S)
                : [];
            let name =
              tokenItem.Item && tokenItem.Item.name
                ? tokenItem.Item.name.S
                : null;
            let mnemonic =
              tokenItem.Item && tokenItem.Item.mnemonic
                ? tokenItem.Item.mnemonic.S
                : null;
            // let addr = (tokenItem.Item && tokenItem.Item.address) ? tokenItem.Item.address.S : null;

            // console.log('old item', tokenItem, {tokens, mnemonic});

            const token = crypto.randomBytes(32).toString("base64");
            tokens.push(token);
            while (tokens.length > 10) {
              tokens.shift();
            }
            if (!name) {
              name = namegen(2).join("-");
            }
            if (!mnemonic) {
              mnemonic = bip39.generateMnemonic();
              /* const wallet = hdkey.fromMasterSeed(bip39.mnemonicToSeedSync(mnemonic)).derivePath(`m/44'/60'/0'/0/0`).getWallet();
            addr = wallet.getAddressString(); */
            }

            await ddb
              .putItem({
                TableName: tableName,
                Item: {
                  email: { S: twitterid + ".twittertoken" },
                  mnemonic: { S: mnemonic },
                  // address: {S: addr},
                },
              })
              .promise();

            // respond
            _setCorsHeaders(res);
            res.end(JSON.stringify({ mnemonic }));
          } else {
            _respond(
              403,
              JSON.stringify({
                error: "Invalid code",
              })
            );
          }
        } else {
          _respond(
            403,
            JSON.stringify({
              error: "Invalid Twitter ID",
            })
          );
        }
      } else if (signature && nonce) {
        const proofOfAddressMessage = `Proof of address. Nonce: ` + nonce;

        const { r, s, v } = ethereumJsUtil.fromRpcSig(signature);

        const prefix = Buffer.from("\x19Ethereum Signed Message:\n");
        const bs = [
          prefix,
          Buffer.from(String(proofOfAddressMessage.length)),
          Buffer.from(proofOfAddressMessage),
        ];
        const prefixedMsg = ethereumJsUtil.sha3(
          "0x" + Buffer.concat(bs).toString("hex")
        );

        const pubKey = ethereumJsUtil.ecrecover(prefixedMsg, v, r, s);
        const addrBuf = ethereumJsUtil.pubToAddress(pubKey);
        const address = ethereumJsUtil.bufferToHex(addrBuf);

        console.log("recovered signature 1", { address, nonce });

        const nonceSeen = await (async () => {
          const nonceKey = address + ":" + nonce + ".nonce";
          const tokenItem = await ddb
            .getItem({
              TableName: tableName,
              Key: {
                email: { S: nonceKey },
              },
            })
            .promise();
          if (tokenItem.Item) {
            return true;
          } else {
            await ddb
              .putItem({
                TableName: tableName,
                Item: {
                  email: { S: nonceKey },
                  used: { S: "1" },
                },
              })
              .promise();
            return false;
          }
        })();
        console.log("recovered signature 2", { address, nonce, nonceSeen });
        if (!nonceSeen) {
          const tokenItem = await ddb
            .getItem({
              TableName: tableName,
              Key: {
                email: { S: address + ".address" },
              },
            })
            .promise();
          let mnemonic =
            tokenItem.Item && tokenItem.Item.mnemonic
              ? tokenItem.Item.mnemonic.S
              : null;
          // let addr = (tokenItem.Item && tokenItem.Item.address) ? tokenItem.Item.address.S : null;

          if (!mnemonic) {
            mnemonic = bip39.generateMnemonic();
          }

          await ddb
            .putItem({
              TableName: tableName,
              Item: {
                email: { S: address + ".address" },
                mnemonic: { S: mnemonic },
                // address: {S: addr},
              },
            })
            .promise();

          _setCorsHeaders(res);
          res.end(JSON.stringify({ mnemonic }));
        } else {
          _setCorsHeaders(res);
          res.statusCode = 403;
          res.end();
        }
      } else if (autoip) {
        const ip = req.connection.remoteAddress;
        if (autoip === "src" && mnemonic) {
          console.log("got remote address src", ip);

          await ddb
            .putItem({
              TableName: tableName,
              Item: {
                email: { S: ip + ".ipcode" },
                mnemonic: { S: mnemonic },
                timeout: { N: Date.now() + 60 * 1000 + "" },
              },
            })
            .promise();

          _respond(
            200,
            JSON.stringify({
              ip,
            })
          );
        } else if (autoip === "dst") {
          console.log("got remote address dst", ip);

          const codeItem = await ddb
            .getItem({
              TableName: tableName,
              Key: {
                email: { S: ip + ".ipcode" },
              },
            })
            .promise();

          console.log(
            "check item",
            ip,
            JSON.stringify(codeItem.Item, null, 2)
          );

          if (
            codeItem.Item &&
            codeItem.Item.mnemonic.S &&
            Date.now() < +new Date(parseInt(codeItem.Item.timeout.N))
          ) {
            await ddb
              .deleteItem({
                TableName: tableName,
                Key: {
                  email: { S: ip + ".ipcode" },
                },
              })
              .promise();

            const mnemonic = codeItem.Item.mnemonic.S;

            _setCorsHeaders(res);
            res.end(JSON.stringify({ mnemonic }));
          } else {
            _respond(
              400,
              JSON.stringify({
                error: "invalid autoip src",
              })
            );
          }
        } else {
          _respond(
            400,
            JSON.stringify({
              error: "invalid autoip parameters",
            })
          );
        }
      } else {
        _respond(
          400,
          JSON.stringify({
            error: "invalid parameters",
          })
        );
      }
    } else {
      _respond(
        400,
        JSON.stringify({
          error: "invalid method",
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


const _handleOauth = async (req, res) => {
  const _respond = (statusCode, body) => {
    res.statusCode = statusCode;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "*");
    res.end(body);
  };

  try {
    // console.log('got payments req', req.url, req.headers);

    const { method } = req;
    const o = url.parse(req.url, true);
    if (method === "GET" && o.pathname === "/github") {
      const { state, code } = o.query;
      console.log("handle github oauth", { state, code });
      const match = state ? state.match(/^(.+?):(.+?):(.+?)$/) : null;
      if (match && code) {
        const email = match[1];
        const token = match[2];
        const redirect = match[3];

        const tokenItem = await ddb
          .getItem({
            TableName: tableName,
            Key: {
              email: { S: email + ".token" },
            },
          })
          .promise();

        // console.log('got item', JSON.stringify(token), tokenItem && tokenItem.Item);

        const tokens = tokenItem.Item
          ? JSON.parse(tokenItem.Item.tokens.S)
          : [];
        if (tokens.includes(token)) {
          console.log("github oauth ok", tokenItem.Item);

          const proxyReq = await https.request(
            {
              method: "POST",
              host: "github.com",
              path: "/login/oauth/access_token",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                // 'User-Agent': 'exokit-server',
              },
            },
            async (proxyRes) => {
              const githubOauthState = await new Promise((accept, reject) => {
                const bs = [];
                proxyRes.on("data", (b) => {
                  bs.push(b);
                });
                proxyRes.on("end", () => {
                  accept(JSON.parse(Buffer.concat(bs).toString("utf8")));
                });
                proxyRes.on("error", (err) => {
                  reject(err);
                });
              });

              await ddb
                .putItem({
                  TableName: tableName,
                  Item: {
                    email: { S: tokenItem.Item.email.S },
                    name: { S: tokenItem.Item.name.S },
                    tokens: { S: tokenItem.Item.tokens.S },
                    // mnemonic: {S: tokenItem.Item.mnemonic.S},
                    // addr: {S: tokenItem.Item.addr.S},
                    state: { S: tokenItem.Item.state.S },
                    stripeState: { S: tokenItem.Item.stripeState.S },
                    stripeConnectState: {
                      S: tokenItem.Item.stripeConnectState.S,
                    },
                    githubOauthState: { S: JSON.stringify(githubOauthState) },
                    // whitelisted: {BOOL: tokenItem.Item.whitelisted.BOOL},
                  },
                })
                .promise();

              res.statusCode = 301;
              res.setHeader("Location", redirect);
              res.end();
            }
          );
          proxyReq.on("error", (err) => {
            _respond(500, err.stack);
          });
          proxyReq.end(
            JSON.stringify({
              client_id: githubClientId,
              client_secret: githubClientSecret,
              code,
              state,
            })
          );
        } else {
          _respond(401, "not authorized");
        }
      } else {
        _respond(400, "invalid parameters");
      }
    } else {
      _respond(404, "not found");
    }
  } catch (err) {
    console.warn(err.stack);
  }
};

module.exports = {
  _handleLogin,
  _handleOauth,
};