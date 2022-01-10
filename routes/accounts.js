const url = require("url");
const fetch = require("node-fetch");

const {
  blockchainSyncServerUrl
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
  try {
    const { method } = req;
    let { pathname: p } = url.parse(req.url);
    if (method === "OPTIONS") {
      _setCorsHeaders(res);
      res.end();
    } else if (method === "GET") {
      if (p === "/") {
        const accounts = await fetch(`${blockchainSyncServerUrl}/account/`).then(res => res.json());
        _respond(200, JSON.stringify(accounts));
      } else {
        const match = p.match(/^\/(0x[a-f0-9]+)$/i);
        if (match) {
          const address = match[1];
          const account = await fetch(`${blockchainSyncServerUrl}/account/${address}`).then(res => res.json());
          _respond(200, JSON.stringify(account));
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