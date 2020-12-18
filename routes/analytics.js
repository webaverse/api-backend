const url = require('url');
const { _setCorsHeaders } = require('../utils.js');

const _handleAnalyticsRequest = async (req, res) => {
    const {
      contentId,
      ownerAddress,
      monetizationPointer
    } = req.params
  
    const {
      amount,
      assetCode,
      assetScale
    } = req.body

    try {
        res = _setCorsHeaders(res);
        const {method} = req;
        if (method === 'OPTIONS') {
            res.end();
        } else if (method === 'GET') {
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
                const json = JSON.parse(s);

                const {
                  amount,
                  assetCode,
                  assetScale
                } = json

                const params = {
                  TableName: monetization,
                  Item: {
                    contentId,
                    ownerAddress,
                    monetizationPointer,
                    amount,
                    assetCode,
                    assetScale,
                    timestamp: Date.now()
                  }
                };
              
                ddbd.put(params, function(err, data) {
                    if (err) {
                        console.error("Unable to add item. Error JSON:", JSON.stringify(err, null, 2));
                    } else {
                        console.log("Added item:", JSON.stringify(data, null, 2));
                    }
                });
             } catch (err) {
                console.log(err);
                res.statusCode = 500;
                res.end(err.stack);
              }
          });
    } catch (err) {
        console.log(err);
        res.statusCode = 500;
        res.end(err.stack);
    }
}

module.exports = {
    _handleAnalyticsRequest,
}
