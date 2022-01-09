const url = require("url");
const querystring = require("querystring");

const { getBlockchain } = require("../blockchain.js");

const {
  nftIndexName,
  redisPrefixes,
  mainnetSignatureMessage,
  cacheHostUrl,
} = require("../constants.js");

const {
  getRedisItem,
  parseRedisItems,
  connect: redisConnect,
  getRedisClient
} = require("../redis.js");

const {
  _isCollaborator,
  _isSingleCollaborator,
} = require("./unlock.js");

const { makePromise } = require("../utils.js");

const _isTokenZero = (token) => {
  return (
    (token.properties.hash === "" &&
      token.owner.address === "0x0000000000000000000000000000000000000000") ||
    (token.properties.hash.startsWith("0xdeaddeaddeaddeaddead") &&
      token.owner.address.toLowerCase().startsWith("0xdeaddeaddeaddeaddead"))
  );
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

const _handleCachedNft =
  (contractName) => (chainName, isAll) => async (req, res) => {
    const _respond = (statusCode, body) => {
      res.statusCode = statusCode;
      _setCorsHeaders(res);
      res.end(body);

      // t.end();
    };
    const _setCorsHeaders = (res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "*");
      res.setHeader("Access-Control-Allow-Methods", "*");
    };
    /* const _maybeGetStoreEntries = () =>
  (contractName === 'NFT' && !isFront)
    ? getStoreEntries(isMainChain)
    : Promise.resolve([]); */

    try {
      const { method } = req;

      if (method === "GET") {
        const { pathname: p } = url.parse(req.url, true);
        let match;
        if ((match = p.match(/^\/([0-9]+)$/))) {
          const tokenId = parseInt(match[1], 10);

          // const t = new Timer('get nft');
          let o = await getRedisItem(
            tokenId,
            redisPrefixes.mainnetsidechainNft
          );
          // t.end();
          let token = o.Item;

          _setCorsHeaders(res);
          if (token) {
            res.setHeader("Content-Type", "application/json");
            _respond(200, JSON.stringify(token));
          } else {
            _respond(404, JSON.stringify(null));
          }
        } else if ((match = p.match(/^\/([0-9]+)-([0-9]+)$/))) {
          const startTokenId = parseInt(match[1], 10);
          const endTokenId = parseInt(match[2], 10);

          if (
            startTokenId >= 1 &&
            endTokenId > startTokenId &&
            endTokenId - startTokenId <= 100
          ) {
            const p = makePromise();
            const args =
              `${nftIndexName} * filter id ${startTokenId} ${endTokenId} LIMIT 0 1000000`
                .split(" ")
                .concat([
                  (err, result) => {
                    if (!err) {
                      console.log("got result", result);
                      const items = parseRedisItems(result);
                      p.accept({
                        Items: items,
                      });
                    } else {
                      p.reject(err);
                    }
                  },
                ]);
            redisClient.ft_search.apply(redisClient, args);
            const o = await p;

            let tokens = o.Items;
            tokens = tokens.filter((token) => token !== null);
            tokens.sort((a, b) => a.id - b.id);
            if (contractName === "NFT") {
              tokens = tokens.filter((token, i) => {
                // filter unique hashes
                if (_isTokenZero(token)) {
                  return false;
                }
                for (let j = 0; j < i; j++) {
                  if (
                    tokens[j].properties.hash === token.properties.hash &&
                    token.properties.hash !== ""
                  ) {
                    return false;
                  }
                }
                return true;
              });
            } else if (contractName === "LAND") {
              tokens = tokens.filter((token) => !!token.name);
            }

            _setCorsHeaders(res);
            res.setHeader("Content-Type", "application/json");
            _respond(200, JSON.stringify(tokens));
            /* res.end(JSON.stringify({
        "name": filename,
        "description": 'Hash ' + hash,
        "image": "https://preview.exokit.org/" + hash.slice(2) + '.' + ext + '/preview.png',
        "external_url": "https://app.webaverse.com?h=" + p.slice(1),
        // "background_color": "000000",
        "animation_url": `${storageHost}/${hash.slice(2)}/preview.${ext === 'vrm' ? 'glb' : ext}`,
        // "animation_url": "http://dl5.webmfiles.org/big-buck-bunny_trailer.webm",
        "properties": {
                "filename": filename,
                "hash": hash,
                "ext": ext,
                "rich_property": {
                        "name": "Name",
                        "value": "123",
                        "display_value": "123 Example Value",
                        "class": "emphasis",
                        "css": {
                                "color": "#ffffff",
                                "font-weight": "bold",
                                "text-decoration": "underline"
                        }
                },
                "array_property": {
                        "name": "Name",
                        "value": [1,2,3,4],
                        "class": "emphasis"
                }
        }
      })); */
          } else {
            _respond(400, "invalid range");
          }
        } else if ((match = p.match(/^\/(0x[a-f0-9]+)$/i))) {
          const address = match[1];

          const [mainnetTokens, sidechainTokens] = await Promise.all([
            (async () => {
              if (isAll) {
                let mainnetAddress = null;
                const account = await getRedisItem(
                  address,
                  redisPrefixes.mainnetsidechainAccount
                );
                const signature = account?.metadata?.["mainnetAddress"];
                if (signature) {
                  const { web3 } = await getBlockchain();
                  mainnetAddress = await web3.testnet.eth.accounts.recover(
                    mainnetSignatureMessage,
                    signature
                  );
                }
                if (mainnetAddress) {
                  const p = makePromise();
                  const args = `${nftIndexName} ${JSON.stringify(
                    mainnetAddress
                  )} INFIELDS 1 currentOwnerAddress LIMIT 0 1000000`
                    .split(" ")
                    .concat([
                      (err, result) => {
                        if (!err) {
                          const items = parseRedisItems(result);
                          // console.log('got result', result);
                          p.accept({
                            Items: items,
                          });
                        } else {
                          p.reject(err);
                        }
                      },
                    ]);
                  redisClient.ft_search.apply(redisClient, args);
                  const o = await p;

                  return (o && o.Items) || [];
                } else {
                  return [];
                }
              } else {
                return [];
              }
            })(),
            (async () => {
              const p = makePromise();
              const args = `${nftIndexName} ${JSON.stringify(
                address
              )} INFIELDS 1 currentOwnerAddress LIMIT 0 1000000`
                .split(" ")
                .concat([
                  (err, result) => {
                    if (!err) {
                      const items = parseRedisItems(result);
                      // console.log('got result', result);
                      p.accept({
                        Items: items,
                      });
                    } else {
                      p.reject(err);
                    }
                  },
                ]);
              redisClient.ft_search.apply(redisClient, args);
              const o = await p;
              return (o && o.Items) || [];
            })(),
          ]);
          let tokens = sidechainTokens.concat(mainnetTokens);
          // tokens = tokens.filter(token => token !== null);
          tokens.sort((a, b) => a.id - b.id);
          if (contractName === "NFT") {
            tokens = tokens.filter((token, i) => {
              // filter unique hashes
              if (_isTokenZero(token)) {
                return false;
              }
              for (let j = 0; j < i; j++) {
                if (
                  tokens[j].properties.hash === token.properties.hash &&
                  token.properties.hash !== ""
                ) {
                  return false;
                }
              }
              return true;
            });
          } else if (contractName === "LAND") {
            tokens = tokens.filter((token) => !!token.name);
          }
          _respond(200, JSON.stringify(tokens));
        } else if (
          (match = p.match(/^\/isCollaborator\/([0-9]+)\/(0x[a-f0-9]+)$/i))
        ) {
          const tokenId = parseInt(match[1], 10);
          const address = match[2];

          const isCollaborator = await _isCollaborator(tokenId, address);

          _setCorsHeaders(res);
          res.setHeader("Content-Type", "application/json");
          _respond(200, JSON.stringify(isCollaborator));
        } else if (
          (match = p.match(
            /^\/isSingleCollaborator\/([0-9]+)\/(0x[a-f0-9]+)$/i
          ))
        ) {
          const tokenId = parseInt(match[1], 10);
          const address = match[2];

          const isSingleCollaborator = await _isSingleCollaborator(
            tokenId,
            address
          );

          _setCorsHeaders(res);
          res.setHeader("Content-Type", "application/json");
          _respond(200, JSON.stringify(isSingleCollaborator));
        } else if ((match = req.url.match(/^\/search\?(.+)$/))) {
          const qs = querystring.parse(match[1]);
          const { q = "*", ext, owner, minter } = qs;
          if (q) {
            const regex = /(\w+)/g;
            const words = [];
            let match;
            while ((match = regex.exec(q))) {
              words.push(`%${match[1]}%`);
            }

            // console.log('got words', words, [`${nftIndexName}`].concat(words.join(' ')));

            let filters = [];
            if (owner) {
              if (filters.length > 0) {
                filters = ["&&"].concat(filters);
              }
              filters.push(`@currentOwnerAddress==${JSON.stringify(owner)}`);
            }
            if (minter) {
              if (filters.length > 0) {
                filters = ["&&"].concat(filters);
              }
              filters.push(`@minterAddress==${JSON.stringify(minter)}`);
            }
            if (filters.length > 0) {
              filters.push("GROUPBY", "1", "@id", "filter");
            }

            const p = makePromise();
            const args = [nftIndexName]
              .concat(words.join(" "))
              .concat(["LIMIT", "0", "1000000"])
              .concat(filters)
              .concat([
                (err, result) => {
                  if (!err) {
                    const items = parseRedisItems(result);
                    // console.log('got result', result);
                    p.accept({
                      Items: items,
                    });
                  } else {
                    p.reject(err);
                  }
                },
              ]);
            redisClient.ft_search.apply(redisClient, args);
            const o = await p;
            const tokens = (o && o.Items) || [];
            _respond(200, JSON.stringify(tokens));
          } else {
            _respond(400, "no query string");
          }
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


const _handleTokens = _handleCachedNft("NFT");


module.exports = {
  _handleTokens,
};