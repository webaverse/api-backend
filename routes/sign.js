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
                      console.log('got txr', [chainName, txid, txr, txr && txr.logs[0], addresses?.[chainName]?.[contractName]]);
                      if (txr) {
                        contracts[chainName][contractName].getPastEvents('Transfer', {
                          fromBlock: txr.blockNumber,
                          toBlock: txr.blockNumber,
                        }, async (error, logs) => {
                          if (error) {
                            // console.log('Error in myEvent event handler: ' + error);
                            res.statusCode = 500;
                            res.end(JSON.stringify({error: error.stack}));
                          } else {
                            const log = logs.find(log => log.transactionHash === txid) || null;
                            // const {returnValues} = log;
                            // console.log('myEvent: ' + JSON.stringify(log, null, 2));
                            if (log) {
                              const proxyContractName = contractName + 'Proxy';
                              // const proxyContract = contracts[chainName][proxyContractName];
                              const proxyContractAddress = addresses[chainName][proxyContractName];
                              
                              const {returnValues} = log;
                              const {from, to} = returnValues;
                              if (to === proxyContractAddress) {
                                // signable
                                if (contractName === 'FT') {
                                  const amount = {
                                    t: 'uint256',
                                    v: new web3[chainName].utils.BN(returnValues.value),
                                  };
                                  const timestamp = {
                                    t: 'uint256',
                                    v: txid,
                                  };
                                  const chainId = {
                                    t: 'uint256',
                                    v: new web3[chainName].utils.BN(chainIds[chainName][proxyContractName]),
                                  };
                                  const message = web3[chainName].utils.encodePacked(from, amount, timestamp, chainId);
                                  const hashedMessage = web3[chainName].utils.sha3(message);
                                  const sgn = web3[chainName].eth.accounts.sign(hashedMessage, wallet.getPrivateKeyString());
                                  // console.log('signed', sgn);
                                  const {r, s, v} = sgn;
                                  /* const r = sgn.slice(0, 66);
                                  const s = '0x' + sgn.slice(66, 130);
                                  const v = '0x' + sgn.slice(130, 132); */
                                  // console.log('got', JSON.stringify({r, s, v}, null, 2));

                                  res.end(JSON.stringify({
                                    to: from,
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
                                    v: new web3[chainName].utils.BN(returnValues.tokenId),
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
                                  console.log('got filename hash', hash, filename);

                                  // get sidechain deposit receipt signature
                                  const timestamp = {
                                    t: 'uint256',
                                    v: txid,
                                  };
                                  const chainId = {
                                    t: 'uint256',
                                    v: new web3[chainName].utils.BN(chainIds[chainName][proxyContractName]),
                                  };

                                  const filenameHash = web3[chainName].utils.sha3(filename.v);
                                  // console.log('sign', {tokenId: log.tokenId, hashSpec, from, tokenId, hash, filenameHash, timestamp, chainId});
                                  const message = web3[chainName].utils.encodePacked(from, tokenId, hash, filenameHash, timestamp, chainId);
                                  const hashedMessage = web3[chainName].utils.sha3(message);
                                  const sgn = web3[chainName].eth.accounts.sign(hashedMessage, wallet.getPrivateKeyString()); // await web3.eth.personal.sign(hashedMessage, address);
                                  const {r, s, v} = sgn;
                                  /* const r = sgn.slice(0, 66);
                                  const s = '0x' + sgn.slice(66, 130);
                                  const v = '0x' + sgn.slice(130, 132); */
                                  // console.log('got', JSON.stringify({r, s, v}, null, 2));
                                  res.end(JSON.stringify({
                                    to: from,
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
                              res.end(JSON.stringify(null));
                            }
                          }
                        });
                        /* const neededContractAddress = addresses?.[chainName]?.[contractName];
                        const logs = txr.logs ? txr.logs.filter(log => log.address === neededContractAddress) : [];
                        res.json(logs); */
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
