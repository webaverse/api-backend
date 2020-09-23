const url = require('url');
const { _setCorsHeaders } = require('../utils.js');
const blockchain = require('../blockchain.js');

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
                const b = Buffer.concat(bs);
                const s = b.toString('utf8');

                if (path === 'sendTransaction') {
                  // console.log('got s', JSON.stringify(s));
                  const spec = JSON.parse(s);
                  const transaction = await blockchain.runTransaction(spec);
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(transaction, null, 2));
                } else {
                  const mnemonic = blockchain.makeMnemonic();
                  const userKeys = await blockchain.genKeys(mnemonic);
                  const address = await blockchain.createAccount(userKeys, s);
                  userKeys.mnemonic = mnemonic;
                  userKeys.address = address;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(userKeys, null, 2));
                }
            });
        }
    }
    catch (e) {
        console.log(e);
    }
}

module.exports = {
    _handleAccountsRequest,
}