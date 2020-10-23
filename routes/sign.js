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
    // main: new Web3(new Web3.providers.HttpProvider(`https://mainnet.infura.io/v3/${infuraProjectId}`)),
    main: new Web3(new Web3.providers.HttpProvider(`https://rinkeby.infura.io/v3/${infuraProjectId}`)),
    // main: new Web3(new Web3.providers.HttpProvider('http://13.56.80.83:8545')),
    sidechain: new Web3(new Web3.providers.HttpProvider('http://13.56.80.83:8545')),
  };
  const addresses = await fetch('https://contracts.webaverse.com/ethereum/address.js').then(res => res.text()).then(s => JSON.parse(s.replace(/^\s*export\s*default\s*/, '')));
  const abis = await fetch('https://contracts.webaverse.com/ethereum/abi.js').then(res => res.text()).then(s => JSON.parse(s.replace(/^\s*export\s*default\s*/, '')));
  const chainIds = await fetch('https://contracts.webaverse.com/ethereum/chain-id.js').then(res => res.text()).then(s => JSON.parse(s.replace(/^\s*export\s*default\s*/, '')));
  const contracts = await (async () => {
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
        result[chainName][contractName] = new web3[chainName].eth.Contract(abis[contractName], addresses[chainName][contractName]);
      });
    });
    return result;
  })();
  const wallet = hdkey.fromMasterSeed(bip39.mnemonicToSeedSync(mnemonic)).derivePath(`m/44'/60'/0'/0/0`).getWallet();
  const address = wallet.getAddressString();

  return {
    web3,
    addresses,
    abis,
    chainIds,
    contracts,
    wallet,
    address,
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
                      console.log('got txr', txr, txr.to.toLowerCase(), addresses[chainName][contractName].toLowerCase());
                      if (txr && txr.to.toLowerCase() === addresses[chainName][contractName].toLowerCase()) {
                        const {logs} = txr;
                        const log = logs.find(log =>
                          (contractName === 'FT' && log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') || // ERC20 Transfer
                          (contractName === 'NFT' && log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') // ERC721 withdraw
                        ) || null;
                        // const {returnValues} = log;
                        // console.log('myEvent: ' + JSON.stringify(log, null, 2));
                        console.log('got log', logs, log);
                        if (log) {
                          const oppositeChainName = chainName === 'main' ? 'sidechain' : 'main';
                          const proxyContractName = contractName + 'Proxy';
                          // const proxyContract = contracts[chainName][proxyContractName];
                          const proxyContractAddress = addresses[chainName][proxyContractName];
                          
                          // const {returnValues} = log;
                          // const {from, to: toInverse} = returnValues;
                          const from = log.topics[1];
                          const toInverse = log.topics[2];
                          // if (to === proxyContractAddress) {
                          const to = '0x' + web3[chainName].utils.padLeft(
                            new web3[chainName].utils.BN(toInverse.slice(2), 16).xor(new web3[chainName].utils.BN('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', 16)).toString(16),
                            40
                          );
                          // signable
                          if (contractName === 'FT') {
                            const amount = {
                              t: 'uint256',
                              v: new web3[chainName].utils.BN(log.data.slice(2), 16),
                            };
                            const timestamp = {
                              t: 'uint256',
                              v: txid,
                            };
                            const chainId = {
                              t: 'uint256',
                              v: new web3[chainName].utils.BN(chainIds[oppositeChainName][contractName]),
                            };
                            const message = web3[chainName].utils.encodePacked(to, amount, timestamp, chainId);
                            const hashedMessage = web3[chainName].utils.sha3(message);
                            const sgn = web3[chainName].eth.accounts.sign(hashedMessage, wallet.getPrivateKeyString());
                            // console.log('signed', sgn);
                            const {r, s, v} = sgn;
                            /* const r = sgn.slice(0, 66);
                            const s = '0x' + sgn.slice(66, 130);
                            const v = '0x' + sgn.slice(130, 132); */
                            // console.log('got', JSON.stringify({r, s, v}, null, 2));

                            res.end(JSON.stringify({
                              to,
                              amount: '0x' + web3[chainName].utils.padLeft(amount.v.toString(16), 32),
                              timestamp: timestamp.v,
                              chainId: chainId.v.toNumber(),
                              r,
                              s,
                              v,
                            }));
                          } else if (contractName === 'NFT') {
                            const tokenId = {
                              t: 'uint256',
                              v: new web3[chainName].utils.BN(log.topics[3].slice(2), 16),
                            };
                            
                            const hashSpec = await contracts[chainName][contractName].methods.getHash(tokenId.v).call();
                            const hash = {
                              t: 'uint256',
                              v: new web3[chainName].utils.BN(hashSpec),
                            };
                            const filenameSpec = await contracts[chainName][contractName].methods.getMetadata(hashSpec, 'filename').call();
                            const filename = {
                              t: 'string',
                              v: filenameSpec,
                            };
                            // console.log('got filename hash', hash, filename);

                            // get sidechain deposit receipt signature
                            const timestamp = {
                              t: 'uint256',
                              v: txid,
                            };
                            const chainId = {
                              t: 'uint256',
                              v: new web3[chainName].utils.BN(chainIds[oppositeChainName][contractName]),
                            };

                            const filenameHash = web3[chainName].utils.sha3(filename.v);
                            // console.log('sign', {tokenId: log.tokenId, hashSpec, toInverse, tokenId, hash, filenameHash, timestamp, chainId});
                            const message = web3[chainName].utils.encodePacked(to, tokenId, hash, filenameHash, timestamp, chainId);
                            const hashedMessage = web3[chainName].utils.sha3(message);
                            const sgn = web3[chainName].eth.accounts.sign(hashedMessage, wallet.getPrivateKeyString()); // await web3.eth.personal.sign(hashedMessage, address);
                            const {r, s, v} = sgn;
                            /* const r = sgn.slice(0, 66);
                            const s = '0x' + sgn.slice(66, 130);
                            const v = '0x' + sgn.slice(130, 132); */
                            // console.log('got', JSON.stringify({r, s, v}, null, 2));
                            res.end(JSON.stringify({
                              to,
                              tokenId: '0x' + web3[chainName].utils.padLeft(tokenId.v.toString(16), 32),
                              hash: '0x' + web3[chainName].utils.padLeft(hash.v.toString(16), 32),
                              filenameHash,
                              timestamp: timestamp.v,
                              chainId: chainId.v.toNumber(),
                              r,
                              s,
                              v,
                            }));
                          } else {
                            res.end(JSON.stringify(null));
                          }
                        } else {
                          res.end(JSON.stringify(null));
                        }
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

/* const express = require('express');
const app = express();
app.all('*', _handleSignRequest);
app.listen(3002); */

module.exports = {
  _handleSignRequest,
};
