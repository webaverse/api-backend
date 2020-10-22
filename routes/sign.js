const crypto = require('crypto');
const url = require('url');
// const util = require('util');
// const fs = require('fs');
// const {spawn} = require('child_process');
const fetch = require('node-fetch');
const Web3 = require('web3');
const bip39 = require('bip39');
const {hdkey} = require('ethereumjs-wallet');
const {_setCorsHeaders} = require('../utils.js');
const {mnemonic, infuraProjectId} = require('../config.json');

const loadPromise = (async () => {
  const web3 = {
    main: new Web3(new Web3.providers.HttpProvider(`https://mainnet.infura.io/v3/${infuraProjectId}`)),
    sidechain: new Web3(new Web3.providers.HttpProvider('http://13.56.80.83:8545')),
  };
  const addresses = await fetch('https://contracts.webaverse.com/ethereum/address.js').then(res => res.text()).then(s => JSON.parse(s.replace(/^\s*export\s*default\s*/, '')));
  const abis = await fetch('https://contracts.webaverse.com/ethereum/abi.js').then(res => res.text()).then(s => JSON.parse(s.replace(/^\s*export\s*default\s*/, '')));
  const chainIds = await fetch('https://contracts.webaverse.com/ethereum/chain-id.js').then(res => res.text()).then(s => JSON.parse(s.replace(/^\s*export\s*default\s*/, '')));
  const contracts = (async () => {
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
        result[contractName] = new web3[chainName].eth.Contract(abis[contractName], addresses[chainName][contractName]);
      });
    });
    return result;
  })();
  const wallet = hdkey.fromMasterSeed(bip39.mnemonicToSeedSync(mnemonic)).derivePath(`m/44'/60'/0'/0/0`).getWallet();
  
  return {
    web3,
    addresses,
    abis,
    chainIds,
    contracts,
    wallet,
  };
})();

const _handleSignRequest = async (req, res) => {
    console.log('sign request', req.url);
    
    const {web3, addresses, abis, chainIds, contracts, wallet} = await loadPromise;
    
    const request = url.parse(req.url);
    // const path = request.path.split('/')[1];
    try {
        res = _setCorsHeaders(res);
        const {method} = req;
        if (method === 'OPTIONS') {
            res.end();
        } else if (method === 'GET') {
            const match = request.path.match(/^\/(.+?)\/(.+?)\/(.+?)$/);
            if (match) {
                const chainName = match[1];
                const contractName = match[2];
                const txid = match[3];
                const chainId = chainIds?.[chainName]?.[contractName];
                if (typeof chainId === 'number') {
                    try {
                      const txr = await web3[chainName].eth.getTransactionReceipt(txid);
                      if (txr.contractAddress === addresses?.[chainName]?.[contractName]) {
                        res.json(txr);
                      } else {
                        res.statusCode = 404;
                        res.end();
                      }
                    } catch(err) {
                      console.warn(err);
                      res.statusCode = 404;
                      res.end();
                    }
                } else {
                    res.statusCode = 404;
                    res.end();
                }
            } else {
                res.statusCode = 404;
                res.end();
            }
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

const express = require('express');
const app = express();
app.all('*', _handleSignRequest);
app.listen(3002);

module.exports = {
  _handleSignRequest,
};
