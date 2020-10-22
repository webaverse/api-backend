const crypto = require('crypto');
const url = require('url');
// const util = require('util');
// const fs = require('fs');
// const {spawn} = require('child_process');
const fetch = require('node-fetch');
const Web3 = require('web3');
const bip39 = require('bip39');
const {hdkey} = require('ethereumjs-wallet');
const {mnemonic, infuraProjectId} = require('../config.json');

const loadPromise = (async () => {
  const web3 = new Web3(new Web3.providers.HttpProvider(`https://mainnet.infura.io/v3/${infuraProjectId}`));
  const contracts = (async () => {
    const addresses = await fetch('https://contracts.webaverse.com/ethereum/address.js').then(res => res.text()).then(s => JSON.parse(s.replace(/^\s*export\s*default\s*/, '')));
    const abis = await fetch('https://contracts.webaverse.com/ethereum/abi.js').then(res => res.text()).then(s => JSON.parse(s.replace(/^\s*export\s*default\s*/, '')));
    console.log('got addresses', addresses);
    const result = {
      main: {},
      sidechain: {},
    };
    [
      'main',
      'sidechain',
    ].forEach(chainName => {
      [
        'Account',
        'FT',
        'NFT',
        'FTProxy',
        'NFTProxy',
      ].forEach(contractName => {
        result[contractName] = new web3.eth.Contract(abis[contractName], addresses[chainName][contractName]);
      });
    });
    return result;
  })();
  const wallet = hdkey.fromMasterSeed(bip39.mnemonicToSeedSync(mnemonic)).derivePath(`m/44'/60'/0'/0/0`).getWallet();
  
  return {
    web3,
    wallet,
    contracts,
  };
})();

const _handleSignRequest = async (req, res) => {
    console.log('sign request', req.url);
    
    const request = url.parse(req.url);
    const path = request.path.split('/')[1];
    let match;
    try {
        res = _setCorsHeaders(res);
        const {method} = req;
        if (method === 'OPTIONS') {
            res.end();
        } else if (method === 'GET') {
            if (path === 'latestBlock') {
                const latestBlock = await blockchain.getLatestBlock();
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(latestBlock, null, 2));
            } else if (match = request.path.match(/^\/getEvents\/([^\/]+)\/([0-9]+)\/([0-9]+)$/)) {
                const eventTypes = match[1].split(',');
                const startBlock = parseInt(match[2], 10);
                const endBlock = parseInt(match[3], 10);
                let result = [];
                await Promise.all(eventTypes.map(eventType =>
                    blockchain.getEvents(eventType, startBlock, endBlock)
                        .then(events => {
                            result.push.apply(result, events);
                        })
                ));
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(result, null, 2));
            } else {
                res.statusCode = 404;
                res.end();
            }
        } else if (method === 'POST') {
            console.log('got post');
            const bs = [];
            req.on('data', d => {
                bs.push(d);
            });
            req.on('end', async () => {
                try {
                  const b = Buffer.concat(bs);
                  const s = b.toString('utf8');

                  if (path === 'sendTransaction') {
                    console.log('run tx 1');
                    const spec = JSON.parse(s);
                    const transaction = await blockchain.runTransaction(spec);
                    console.log('run tx 2', transaction);
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(transaction, null, 2));
                  } else {
                    const userKeys = await accountManager.getAccount();
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

/* const express = require('express');
const app = express();
app.all('*', _handleSignRequest);
app.listen(3002); */

module.exports = {
  _handleSignRequest,
};
