const url = require("url");
const {
  getRedisItem,
  getRedisAllItems,
} = require("../redis.js");

const {
  accountKeys,
  ids,
  redisPrefixes,
} = require("../constants.js");

const _handleAccounts = (chainName) => async (req, res) => {
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
  const _makeFakeAccount = (address) => {
    const account = {
      address,
    };
    for (const k of accountKeys) {
      account[k] = "";
    }
    return account;
  };
  const _getAccount = async (address) =>
    getRedisItem(address, redisPrefixes.mainnetsidechainAccount).then(
      (o) => o.Item || _makeFakeAccount(address)
    );

  try {
    const { method } = req;
    let { pathname: p } = url.parse(req.url);
    // console.log('ipfs request', {method, p});

    if (method === "OPTIONS") {
      // res.statusCode = 200;
      _setCorsHeaders(res);
      res.end();
    } else if (method === "GET") {
      if (p === "/") {
        let accounts = await getRedisAllItems(
          redisPrefixes.mainnetsidechainAccount
        );
        accounts = accounts.filter(
          (a) => a.id !== ids.lastCachedBlockAccount
        );
        _respond(200, JSON.stringify(accounts));
      } else {
        const match = p.match(/^\/(0x[a-f0-9]+)$/i);
        if (match) {
          const address = match[1];
          const result = await _getAccount(address);
          console.log("fetched account", address, result);
          _respond(200, JSON.stringify(result));
        } else {
          _respond(404, "");
        }
      }
    } else {
      _respond(404, "");
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
  _handleAccounts,
};