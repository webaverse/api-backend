const crypto = require('crypto');
const url = require('url');
const dns = require('dns');
// const util = require('util');
// const fs = require('fs');
// const {spawn} = require('child_process');
const fetch = require('node-fetch');
const Web3 = require('web3');
const bip39 = require('bip39');
const {hdkey} = require('ethereumjs-wallet');
const {_setCorsHeaders} = require('../utils.js');
const {mainnetMnemonic, /* rinkebyMnemonic, */ infuraProjectId} = require('../config.json');

const loadPromise = (async () => {
  const ethereumHost = 'ethereum.exokit.org';

  const ethereumHostAddress = await new Promise((accept, reject) => {
    dns.resolve4(ethereumHost, (err, addresses) => {
      if (!err) {
        if (addresses.length > 0) {
          accept(addresses[0]);
        } else {
          reject(new Error('no addresses resolved for ' + ethereumHostname));
        }
      } else {
        reject(err);
      }
    });
  });
  gethNodeUrl = `http://${ethereumHostAddress}`;

  const web3 = {
    mainnet: new Web3(new Web3.providers.HttpProvider(`https://mainnet.infura.io/v3/${infuraProjectId}`)),
    mainnetsidechain: new Web3(new Web3.providers.HttpProvider(gethNodeUrl + ':8545')),
    // rinkeby: new Web3(new Web3.providers.HttpProvider(`https://rinkeby.infura.io/v3/${infuraProjectId}`)),
    // rinkebysidechain: new Web3(new Web3.providers.HttpProvider(gethNodeUrl + ':8546')),
  };
  const addresses = await fetch('https://contracts.webaverse.com/config/addresses.js').then(res => res.text()).then(s => JSON.parse(s.replace(/^\s*export\s*default\s*/, '')));
  const abis = await fetch('https://contracts.webaverse.com/config/abi.js').then(res => res.text()).then(s => JSON.parse(s.replace(/^\s*export\s*default\s*/, '')));
  const chainIds = await fetch('https://contracts.webaverse.com/config/chain-id.js').then(res => res.text()).then(s => JSON.parse(s.replace(/^\s*export\s*default\s*/, '')));
  const contracts = await (async () => {
    console.log('got addresses', addresses);
    const result = {};
    [
      'mainnet',
      'mainnetsidechain',
      /* 'rinkeby',
      'rinkebysidechain', */
    ].forEach(chainName => {
      [
        'Account',
        'FT',
        'NFT',
        'LAND',
        'FTProxy',
        'NFTProxy',
        'LANDProxy',
      ].forEach(contractName => {
        if (!result[chainName]) {
          result[chainName] = {};
        }
        result[chainName][contractName] = new web3[chainName].eth.Contract(abis[contractName], addresses[chainName][contractName]);
      });
    });
    return result;
  })();
  const wallets = {
    mainnet: hdkey.fromMasterSeed(bip39.mnemonicToSeedSync(mainnetMnemonic)).derivePath(`m/44'/60'/0'/0/0`).getWallet(),
    // rinkeby: hdkey.fromMasterSeed(bip39.mnemonicToSeedSync(rinkebyMnemonic)).derivePath(`m/44'/60'/0'/0/0`).getWallet(),
  };

  return {
    web3,
    addresses,
    abis,
    chainIds,
    contracts,
    wallets,
  };
})();

const proofOfAddressMessage = "Proof of address."
const _handleUnlockRequest = async (req, res) => {
    console.log('sign request', req.url);
    
    const {web3, addresses, abis, chainIds, contracts, wallets} = await loadPromise;
    
    const request = url.parse(req.url);
    // const path = request.path.split('/')[1];
    try {
        res = _setCorsHeaders(res);
        const {method} = req;
        if (method === 'OPTIONS') {
            res.end();
        } else if (method === 'POST') {
            const j = await new Promise((accept, reject) => {
              const bs = [];
              req.on('data', d => {
                bs.push(d);
              });
              req.on('end', () => {
                const b = Buffer.concat(bs);
                const s = b.toString('utf8');
                const j = JSON.parse(s);
                accept(j);
              });
              req.on('error', reject);
            });
            const {signature} = j;
            let address = null;
            try {
              address = await web3.mainnet.eth.personal.ecRecover(proofOfAddressMessage, signature);
            } catch(err) {
              console.warn(err.stack);
            }
            
            if (address !== null) {
              res.json({
                ok: true,
              });
            } else {
              res.statusCode = 400;
              res.json({
                ok: false,
              });
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

module.exports = {
  _handleUnlockRequest,
};
