const url = require('url');
const { getObject, putObject } = require('../aws.js');
const crypto = require('crypto');

const _handleStorageRequest = async (req, res) => {
    const request = url.parse(req.url);
    const path = request.path.split('/')[2];
    try {
        res.setHeader("Access-Control-Allow-Origin", "*");
        const { method } = req;
        if (method === 'POST') {
            let data = [];
            req.on('data', chunk => {
                data.push(chunk)
            })
            req.on('end', async () => {
                const hash = crypto.createHash('SHA3-256');
                const buffer = new Buffer.concat(data);
                hash.update(buffer);
                const hashHex = hash.digest('hex');
                await putObject('storage.exokit.org', hashHex + '.vrm', buffer);
                res.statusCode = 200;
                res.end(JSON.stringify({
                    hash: hashHex
                }));
            })
        } else if (method === 'GET' && path) {
            res.writeHead(301, {"Location": 'https://s3-us-west-1.amazonaws.com/storage.exokit.org/' + path});
            res.end();
        } else if (method === 'DELETE' && path) {
            res.statusCode = 200;
            res.end();
        }
    }
    catch (e) {
        console.log(e);
    }
}

module.exports = {
    _handleStorageRequest
}