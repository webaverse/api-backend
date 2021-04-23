const path = require('path');
const http = require('http');
const bip39 = require('bip39');
const {hdkey} = require('ethereumjs-wallet');
const {getBlockchain} = require('../../../blockchain.js');
const {makePromise, setCorsHeaders} = require('../../../utils.js');
const {getRedisItem, parseRedisItems, getRedisClient} = require('../../../redis.js');
const {redisPrefixes, mainnetSignatureMessage, nftIndexName, mintingFee, burnAddress, zeroAddress, IPFS_HOST, MAINNET_MNEMONIC, PINATA_API_KEY, PINATA_SECRET_API_KEY, defaultTokenDescription} = require('../../../constants.js');
const {ResponseStatus} = require("../enums.js");
const {runSidechainTransaction} = require("../../../tokens.js");
const {production, development} = require("../environment.js");

const pinataSDK = require('@pinata/sdk');
const pinata = (PINATA_API_KEY && PINATA_API_KEY !== "") ? pinataSDK(PINATA_API_KEY, PINATA_SECRET_API_KEY) : null;

const pinataOptions = {
    pinataOptions: {
        customPinPolicy: {
            regions: [
                {
                    id: 'FRA1',
                    desiredReplicationCount: 1
                },
                {
                    id: 'NYC1',
                    desiredReplicationCount: 2
                }
            ]
        }
    }
};

const redisClient = getRedisClient();

const network = production ? 'mainnet' : 'testnet';

const {Readable} = require('stream');

let contracts;

(async function () {
    contracts = await getBlockchain().contracts;
})();


// Takes an account as input
async function listTokens(req, res, web3) {
    const {address, mainnetAddress} = req.params;

    if (development) setCorsHeaders(res);
    try {
        const [
            mainnetTokens,
            sidechainTokens,
        ] = await Promise.all([
            (async () => {
                if (!mainnetAddress) return [];
                const recoveredAddress = await web3[network].eth.accounts.recover(mainnetSignatureMessage, mainnetAddress);
                if (!recoveredAddress) return [];
                const p = makePromise();
                const args = `${nftIndexName} ${JSON.stringify(recoveredAddress)} INFIELDS 1 currentOwnerAddress LIMIT 0 1000000`.split(' ').concat([(err, result) => {
                    if (!err) {
                        const items = parseRedisItems(result);
                        p.accept({
                            Items: items,
                        });
                    } else {
                        p.reject(err);
                    }
                }]);
                redisClient.ft_search.apply(redisClient, args);
                const o = await p;

                return (o && o.Items) || [];
            })(),
            (async () => {
                const p = makePromise();
                const args = `${nftIndexName} ${JSON.stringify(address)} INFIELDS 1 currentOwnerAddress LIMIT 0 1000000`.split(' ').concat([(err, result) => {
                    if (!err) {
                        const items = parseRedisItems(result);
                        p.accept({
                            Items: items,
                        });
                    } else {
                        p.reject(err);
                    }
                }]);
                redisClient.ft_search.apply(redisClient, args);
                const o = await p;
                return (o && o.Items) || [];
            })(),
        ]);
        const tokens = sidechainTokens
            .concat(mainnetTokens)
            .sort((a, b) => a.id - b.id)
            .filter((token, i) => { // filter unique hashes
                if (token === "0" || (token.properties.hash === "" && token.owner.address === zeroAddress))
                    return false;

                for (let j = 0; j < i; j++) {
                    if (tokens[j].properties.hash === token.properties.hash && token.properties.hash !== "")
                        return false;
                }
                return true;
            });
        return res.json({status: ResponseStatus.Success, tokens: JSON.stringify(tokens), error: null});
    } catch (error) {
        return res.json({status: ResponseStatus.Error, tokens: null, error});
    }
}

async function createToken(req, res, {web3, contracts}) {
    let status, tokenIds;
    async function mintTokens(hash, quantity) {
        const fullAmount = {
            t: 'uint256',
            v: new web3.utils.BN(1e9)
                .mul(new web3.utils.BN(1e9))
                .mul(new web3.utils.BN(1e9)),
        };
    
        const fullAmountD2 = {
            t: 'uint256',
            v: fullAmount.v.div(new web3.utils.BN(2)),
        };
        const wallet = hdkey.fromMasterSeed(bip39.mnemonicToSeedSync(mnemonic)).derivePath(`m/44'/60'/0'/0/0`).getWallet();
        const address = wallet.getAddressString();
    
        if (mintingFee > 0) {
            let allowance = await contracts['FT'].methods.allowance(address, contracts['NFT']._address).call();
            allowance = new web3.utils.BN(allowance, 0);
            if (allowance.lt(fullAmountD2.v)) {
                const result = await runSidechainTransaction(mnemonic)('FT', 'approve', contracts['NFT']._address, fullAmount.v);
                status = result.status;
            } else {
                status = true;
            }
        } else status = true;
    
        if (status) {
            const description = defaultTokenDescription;
    
            let fileName = hash.split('/').pop();
    
            let extName = path.extname(fileName).slice(1);
            extName = extName === "" ? "png" : extName
            extName = extName === "jpeg" ? "jpg" : extName
    
            fileName = extName ? fileName.slice(0, -(extName.length + 1)) : fileName;
    
            const {hash} = JSON.parse(Buffer.from(hash, 'utf8').toString('utf8'));
    
            const result = await runSidechainTransaction(mnemonic)('NFT', 'mint', address, hash, fileName, extName, description, quantity);
            status = result.status;
    
            const tokenId = new web3.utils.BN(result.logs[0].topics[3].slice(2), 16).toNumber();
            tokenIds = [tokenId, tokenId + quantity - 1];
        }
        return res.json({status: ResponseStatus.Success, tokenIds, error: null});
    }
    try {
        const {mnemonic, quantity} = req.body;
        let {resourceHash} = req.body;

        const file = req.files && req.files[0];

        if(!bip39.validateMnemonic(mnemonic)){
            return res.json({status: ResponseStatus.Error, error: "Invalid mnemonic"});
        }

        if(!resourceHash && !file){
            return res.json({status: ResponseStatus.Error, error: "POST did not include a file or resourceHash"});
        }

        // Check if there are any files -- if there aren't, check if there's a hash
        if(resourceHash && file){
            return res.json({status: ResponseStatus.Error, error: "POST should include a resourceHash *or* file but not both"});
        }

        if(file){
            const readableStream = new Readable({
                read() {
                  this.push(Buffer.from(file));
                  this.push(null);
                }
              });

            // Pinata API keys are valid, so this is probably what the user wants
            if(pinata){
                const {IpfsHash} = pinata.pinFileToIPFS(readableStream, pinataOptions)
                if(IpfsHash) mintTokens(IpfsHash, quantity);
                else res.json({status: ResponseStatus.Error, error: "Error pinning to Pinata service, hash was not returned"});
            } else {
            // Upload to our own IPFS node
            const req = http.request(IPFS_HOST, {method: 'POST'}, res => {
                const bufferString = [];
                res.on('data', data => {
                    bufferString.push(data);
                });
                res.on('end', async () => {
                    const buffer = Buffer.concat(bufferString);
                    const string = buffer.toString('utf8');
                    const {hash} = JSON.parse(string);
                    if(hash) mintTokens(hash, quantity);
                    else return res.json({status: ResponseStatus.Error, error: "Error getting hash back from IPFS node"});
                });
                res.on('error', err => {
                    console.warn(err.stack);
                    return res.json({status: ResponseStatus.Error, error: err.stack});
                });
            });
            req.on('error', err => {
                console.warn(err.stack);
                res.json({status: ResponseStatus.Error, error: err.stack});
            });
            file.pipe(req);
        }
        } else {
            mintTokens(resourceHash, quantity);
        }

    } catch (error) {
        console.warn(error.stack);
        return res.json({status: ResponseStatus.Error, tokenIds: [], error});
    }
}

async function readToken(req, res) {
    const {tokenId} = req.params;

    let o = await getRedisItem(tokenId, redisPrefixes.mainnetsidechainNft);
    let token = o.Item;

    if (development) setCorsHeaders(res);
    if (token) {
        return res.json({status: ResponseStatus.Success, token, error: null})
    } else {
        return res.json({status: ResponseStatus.Error, token: null, error: "The token could not be found"})
    }
}

async function readTokenRange(req, res) {
    if (development) setCorsHeaders(res);
    try {
        const {tokenStartId, tokenEndId} = req.params;

        if (tokenStartId <= 0 || tokenEndId < tokenStartId || (tokenEndId - tokenStartId) > 100)
            return res.json({status: ResponseStatus.Error, error: "Invalid range for tokens"})


        const promise = makePromise();
        const args = `${nftIndexName} * filter id ${tokenStartId} ${tokenEndId} LIMIT 0 1000000`.split(' ').concat([(err, result) => {
            if (!err) {
                const items = parseRedisItems(result);
                promise.accept({
                    Items: items,
                });
            } else {
                promise.reject(err);
            }
        }]);
        redisClient.ft_search.apply(redisClient, args);
        const o = await promise;

        let tokens = o.Items
            .filter(token => token !== null)
            .sort((a, b) => a.id - b.id)
            .filter((token, i) => { // filter unique hashes

                if (token.properties.hash === "" && token.owner.address === zeroAddress)
                    return false;

                for (let j = 0; j < i; j++)
                    if (tokens[j].properties.hash === token.properties.hash && token.properties.hash !== "")
                        return false;

                return true;
            });


        return res.json({status: ResponseStatus.Success, tokens, error: null})
    } catch (error) {
        return res.json({status: ResponseStatus.Error, tokens: [], error})
    }
}

async function deleteToken(req, res) {
    try {
        const {tokenId} = req.body;

        let o = await getRedisItem(tokenId, redisPrefixes.mainnetsidechainNft);
        let token = o.Item;

        const address = token.owner.address;

        const currentHash = await contracts['mainnetsidechain'].NFT.methods.getHash(tokenId).call();
        const r = Math.random().toString(36);
        await runSidechainTransaction(MAINNET_MNEMONIC)('NFT', 'updateHash', currentHash, r);
        const result = await runSidechainTransaction(MAINNET_MNEMONIC)('NFT', 'transferFrom', address, burnAddress, tokenId);

        if (result) console.log("Result of delete transaction:", result);
        return res.json({status: ResponseStatus.Success, error: null})
    } catch (error) {
        return res.json({status: ResponseStatus.Error, error})
    }
}

async function sendToken(req, res) {
    try {
        const {fromUserAddress, toUserAddress, tokenId} = req.body;
        const quantity = req.body.quantity ?? 1;

        let status = true;
        let error = null;
        for (let i = 0; i < quantity; i++) {
            try {
                const isApproved = await contracts.NFT.methods.isApprovedForAll(fromUserAddress, contracts['Trade']._address).call();
                if (!isApproved) {
                    await runSidechainTransaction(MAINNET_MNEMONIC)('NFT', 'setApprovalForAll', contracts['Trade']._address, true);
                }

                const result = await runSidechainTransaction(MAINNET_MNEMONIC)('NFT', 'transferFrom', fromUserAddress, toUserAddress, tokenId);
                status = status && result.status;
            } catch (err) {
                console.warn(err.stack);
                status = false;
                error = err;
                break;
            }
        }

        if (status) {
            return res.json({status: ResponseStatus.Success, message: 'Transferred ' + tokenId + ' to ' + toUserAddress, error: null})
        } else {
            return res.json({status: ResponseStatus.Error, message: 'Transfer request could not be fulfilled: ' + status, error: error})
        }
    } catch (error) {
        return res.json({status: ResponseStatus.Error, message: 'Error sending token', error: error})
    }
}

async function signTransfer(req, res, blockchain) {
    console.warn("Method not implemented", req, res, blockchain);
}

module.exports = {
    listTokens,
    createToken,
    readToken,
    readTokenRange,
    deleteToken,
    sendToken,
    signTransfer
}
