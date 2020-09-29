const url = require('url');
const { _setCorsHeaders } = require('../utils.js');
const blockchain = require('../blockchain.js');

const _jsonParse = s => {
   try {
       return JSON.parse(s);
   } catch(err) {
       return null;
   }
};

const _handleAccountsRequest = async (req, res) => {
    const request = url.parse(req.url);
    const path = request.path.split('/')[1];
    try {
        res = _setCorsHeaders(res);
        const {method} = req;
        if (method === 'OPTIONS') {
            res.end();
        } else if (method === 'POST') {
            const bs = [];
            req.on('data', d => {
                bs.push(d);
            });
            req.on('end', async () => {
                try {
                  const b = Buffer.concat(bs);
                  const s = b.toString('utf8');
                  const j = _jsonParse(s);
                  const bake = j ? !!j.bake : false;

                  if (path === 'sendTransaction') {
                    const spec = JSON.parse(s);
                    const transaction = await blockchain.runTransaction(spec);
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(transaction, null, 2));
                  } else {
                    const mnemonic = blockchain.makeMnemonic();
                    const userKeys = await blockchain.genKeys(mnemonic);
                    const address = await blockchain.createAccount(userKeys, {bake});
                    userKeys.mnemonic = mnemonic;
                    userKeys.address = address;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(userKeys, null, 2));
                  }
                } catch (err) {
                  console.log(err);
                  res.statusCode = 500;
                  res.end(err.stack);
                }
            });
        }
    } catch (err) {
        console.log(err);
        res.statusCode = 500;
        res.end(err.stack);
    }
}

module.exports = {
    _handleAccountsRequest,
}