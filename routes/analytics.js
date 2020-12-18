const url = require('url');
const { _setCorsHeaders } = require('../utils.js');

/* const _jsonParse = s => {
   try {
       return JSON.parse(s);
   } catch(err) {
       return null;
   }
}; */

const _handleAnalyticsRequest = async (req, res) => {
    const request = url.parse(req.url);
    const path = request.path.split('/')[1];

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

    let match;
    try {
        res = _setCorsHeaders(res);
        const {method} = req;
        if (method === 'OPTIONS') {
            res.end();
        } else if (method === 'GET') {
            res.end();
        } else if (method === 'POST') {
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
        } else {
          res.statusCode = 404;
          res.end();
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
