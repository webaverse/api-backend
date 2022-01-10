const url = require("url");
const querystring = require("querystring");
const fetch = require("node-fetch");

const {
  blockchainSyncServerUrl,
} = require("../constants.js");

const _isTokenZero = (token) => {
  return (
    (token.properties.hash === "" &&
      token.owner.address === "0x0000000000000000000000000000000000000000") ||
    (token.properties.hash.startsWith("0xdeaddeaddeaddeaddead") &&
      token.owner.address.toLowerCase().startsWith("0xdeaddeaddeaddeaddead"))
  );
};

const _handleCachedNft =
  (contractName) => (chainName, isAll) => async (req, res) => {
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
        if ((match = p.match(/^\/([0-9]+)$/))) {
          _setCorsHeaders(res);
          const tokenId = parseInt(match[1], 10);
          const token = await fetch(`${blockchainSyncServerUrl}/webaverse-erc721/${tokenId}`).then(res => res.json());
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
            let tokens = await fetch(`${blockchainSyncServerUrl}/webaverse-erc721/all?start=${startTokenId}&end=${endTokenId}`).then(res => res.json());
            tokens = tokens.filter((token) => token !== null);
            tokens.sort((a, b) => a.id - b.id);
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
            _setCorsHeaders(res);
            res.setHeader("Content-Type", "application/json");
            _respond(200, JSON.stringify(tokens));
          } else {
            _respond(400, "invalid range");
          }
        } else if ((match = p.match(/^\/(0x[a-f0-9]+)$/i))) {
          const address = match[1];
          const tokens = await fetch(`${blockchainSyncServerUrl}/webaverse-erc721/?owner=${address}`).then(res => res.json());
          _respond(200, JSON.stringify(tokens));
        } else if ((match = req.url.match(/^\/search\?(.+)$/))) {
          const qs = querystring.parse(match[1]);
          const { q = "*", ext, owner, minter } = qs;
          if (q) {
            // [TODO] Return tokens here for search

            // const regex = /(\w+)/g;
            // const words = [];
            // let match;
            // while ((match = regex.exec(q))) {
            //   words.push(`%${match[1]}%`);
            // }
            // let filters = [];
            // if (owner) {
            //   if (filters.length > 0) {
            //     filters = ["&&"].concat(filters);
            //   }
            //   filters.push(`@currentOwnerAddress==${JSON.stringify(owner)}`);
            // }
            // if (minter) {
            //   if (filters.length > 0) {
            //     filters = ["&&"].concat(filters);
            //   }
            //   filters.push(`@minterAddress==${JSON.stringify(minter)}`);
            // }
            // if (filters.length > 0) {
            //   filters.push("GROUPBY", "1", "@id", "filter");
            // }

            // const p = makePromise();
            // const args = [nftIndexName]
            //   .concat(words.join(" "))
            //   .concat(["LIMIT", "0", "1000000"])
            //   .concat(filters)
            //   .concat([
            //     (err, result) => {
            //       if (!err) {
            //         const items = parseRedisItems(result);
            //         // console.log('got result', result);
            //         p.accept({
            //           Items: items,
            //         });
            //       } else {
            //         p.reject(err);
            //       }
            //     },
            //   ]);
            // redisClient.ft_search.apply(redisClient, args);
            // const o = await p;
            // const tokens = (o && o.Items) || [];
            _respond(200, JSON.stringify([]));
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