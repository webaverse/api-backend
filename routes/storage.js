const url = require('url');
const { getObject, putObject } = require('../aws.js');
const crypto = require('crypto');

const _handleStorageRequest = async (req, res) => {
    const request = url.parse(req.url);
    const path = request.path.split('/')[2];
    console.log(request, path)
    try {
        res.setHeader("Access-Control-Allow-Origin", "*");
        const { method } = req;
        if (method === 'POST') {
            console.log(req.body)
            const hash = crypto.createHash('SHA3-256');
            hash.update(req.body);
            console.log(hash)
            await putObject('storage.exokit.org', hash, req.body)
            res.statusCode = 200;
            res.end()
        } else if (method === 'GET' && path) {
            const avatar = await getObject('storage.exokit.org', path);
            res.statusCode = 200;
            res.end(avatar)
        } else if (method === 'DELETE' && path) {
            res.statusCode = 200;
            res.end()
        } else {
            res.statusCode = 404;
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