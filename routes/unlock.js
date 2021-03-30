const crypto = require('crypto');
const url = require('url');
const dns = require('dns');
// const util = require('util');
// const fs = require('fs');
// const {spawn} = require('child_process');
const AWS = require('aws-sdk');
const fetch = require('node-fetch');
const Web3 = require('web3');
const bip39 = require('bip39');
const {hdkey} = require('ethereumjs-wallet');
const {jsonParse, _setCorsHeaders} = require('../utils.js');
const {accessKeyId, secretAccessKey, mainnetMnemonic, testnetMnemonic, polygonMnemonic, testnetpolygonMnemonic, infuraProjectId, encryptionMnemonic} = require('../config.json');

const awsConfig = new AWS.Config({
  credentials: new AWS.Credentials({
    accessKeyId,
    secretAccessKey,
  }),
  region: 'us-west-1',
});
const ddb = new AWS.DynamoDB(awsConfig);

const {pipeline, PassThrough} = require('stream');
const {randomBytes, createCipheriv, createDecipheriv} = require('crypto');

const tableName = 'users';
const unlockableKey = 'unlockable';
const nonce = Buffer.alloc(12);
const encodeSecret = (mnemonic, secret) => {
  const wallet = hdkey.fromMasterSeed(bip39.mnemonicToSeedSync(mnemonic)).derivePath(`m/44'/60'/0'/0/0`).getWallet();
  const privateKey = wallet.privateKey;

  const key = privateKey.slice(0, 24);
  // const aad = Buffer.from('0123456789', 'hex');

  const cipher = createCipheriv('aes-192-ccm', key, nonce, {
    authTagLength: 16
  });
  /* cipher.setAAD(aad, {
    plaintextLength: Buffer.byteLength(secret)
  }); */
  const ciphertext = cipher.update(secret, 'utf8');
  cipher.final();
  const tag = cipher.getAuthTag();
  return {
    ciphertext,
    tag,
  };
};
const decodeSecret = (mnemonic, {ciphertext, tag}) => {
  const wallet = hdkey.fromMasterSeed(bip39.mnemonicToSeedSync(mnemonic)).derivePath(`m/44'/60'/0'/0/0`).getWallet();
  const privateKey = wallet.privateKey;

  const key = privateKey.slice(0, 24);
  // const aad = Buffer.from('0123456789', 'hex');

  const decipher = createDecipheriv('aes-192-ccm', key, nonce, {
    authTagLength: 16
  });
  decipher.setAuthTag(tag);
  /* decipher.setAAD(aad, {
    plaintextLength: ciphertext.length
  }); */
  const receivedPlaintext = decipher.update(ciphertext, null, 'utf8');
  return receivedPlaintext;
};

let contracts = null;
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
    testnet: new Web3(new Web3.providers.HttpProvider(`https://rinkeby.infura.io/v3/${infuraProjectId}`)),
    testnetsidechain: new Web3(new Web3.providers.HttpProvider(gethNodeUrl + ':8546'))
  };
  const addresses = await fetch('https://contracts.webaverse.com/config/addresses.js').then(res => res.text()).then(s => JSON.parse(s.replace(/^\s*export\s*default\s*/, '')));
  const abis = await fetch('https://contracts.webaverse.com/config/abi.js').then(res => res.text()).then(s => JSON.parse(s.replace(/^\s*export\s*default\s*/, '')));
  const chainIds = await fetch('https://contracts.webaverse.com/config/chain-id.js').then(res => res.text()).then(s => JSON.parse(s.replace(/^\s*export\s*default\s*/, '')));
  contracts = await (async () => {
    console.log('got addresses', addresses);
    const result = {};
    [
      'mainnet',
      'mainnetsidechain',
      'testnet',
      'testnetsidechain',
      'polygon',
      'polygonsidechain',
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
    testnet: hdkey.fromMasterSeed(bip39.mnemonicToSeedSync(testnetMnemonic)).derivePath(`m/44'/60'/0'/0/0`).getWallet(),
    polygon: hdkey.fromMasterSeed(bip39.mnemonicToSeedSync(polygonMnemonic)).derivePath(`m/44'/60'/0'/0/0`).getWallet(),
    testnetpolygon: hdkey.fromMasterSeed(bip39.mnemonicToSeedSync(testnetpolygonMnemonic)).derivePath(`m/44'/60'/0'/0/0`).getWallet(),
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

const proofOfAddressMessage = `Proof of address.`;
const _areAddressesColaborator = async (addresses, hash) => {
  let isC = false; // collaborator
  let isO1 = false; // owner on sidechain
  let isO2 = false; // owner on mainnet
  for (const address of addresses) {
    const [
      _isC,
      _isO1,
      _isO2,
    ] = await Promise.all([
      (async () => {
        try {
          const isC = await contracts.mainnetsidechain.NFT.methods.isCollaborator(hash, address).call();
          // console.log('got mainnetsidechain is c', {hash, address});
          return isC;
        } catch(err) {
          // console.warn(err);
          return false;
        }
      })(),
      (async () => {
        try {
          let owner = await contracts.mainnetsidechain.NFT.methods.ownerOf(id).call();
          owner = owner.toLowerCase();
          // console.log('got mainnetsidechain owner', {owner, id});
          return owner === address;
        } catch(err) {
          // console.warn(err);
          return false;
        }
      })(),
      (async () => {
        try {
          let owner = await contracts.mainnet.NFT.methods.ownerOf(id).call();
          owner = owner.toLowerCase();
          // console.log('got mainnet owner', {owner} );
          return owner === address;
        } catch(err) {
          // console.warn(err);
          return false;
        }
      })(),
    ]);
    // console.log('iterate address', {address, _isC, _isO1, _isO2});
    isC = isC || _isC;
    isO1 = isO1 || _isO1;
    isO2 = isO2 || _isO2;
  }
  
  // console.log('final addresses', {addresses, isC, isO1, isO2});
  
  return isC || isO1 || isO2;
};
const _areAddressesSingleColaborator = async (addresses, id) => {
  let isC = false; // collaborator
  let isO1 = false; // owner on sidechain
  let isO2 = false; // owner on mainnet
  for (const address of addresses) {
    const [
      _isC,
      _isO1,
      _isO2,
    ] = await Promise.all([
      (async () => {
        try {
          const isC = await contracts.mainnetsidechain.NFT.methods.isSingleCollaborator(id, address).call();
          // console.log('got mainnetsidechain is c', {hash, address});
          return isC;
        } catch(err) {
          // console.warn(err);
          return false;
        }
      })(),
      (async () => {
        try {
          let owner = await contracts.mainnetsidechain.NFT.methods.ownerOf(id).call();
          owner = owner.toLowerCase();
          // console.log('got mainnetsidechain owner', {owner, id});
          return owner === address;
        } catch(err) {
          // console.warn(err);
          return false;
        }
      })(),
      (async () => {
        try {
          let owner = await contracts.mainnet.NFT.methods.ownerOf(id).call();
          owner = owner.toLowerCase();
          // console.log('got mainnet owner', {owner} );
          return owner === address;
        } catch(err) {
          // console.warn(err);
          return false;
        }
      })(),
    ]);
    // console.log('iterate address', {address, _isC, _isO1, _isO2});
    isC = isC || _isC;
    isO1 = isO1 || _isO1;
    isO2 = isO2 || _isO2;
  }
  
  // console.log('final addresses', {addresses, isC, isO1, isO2});
  
  return isC || isO1 || isO2;
};
const _handleUnlockRequest = async (req, res) => {
    // console.log('unlock request', req.url);
    
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
            const {signatures, id} = j;
            // console.log('got j', j);
            const key = unlockableKey;
            // console.log('got sig', {signatures, id});
            const addresses = [];
            let ok = true;
            for (const signature of signatures) {
              try {
                let address = await web3.mainnetsidechain.eth.accounts.recover(proofOfAddressMessage, signature);
                address = address.toLowerCase();
                addresses.push(address);
              } catch(err) {
                console.warn(err.stack);
                ok = false;
              }
            }
            
            // console.log('got sig 2', addresses);
            if (ok) {
              const hash = await contracts.mainnetsidechain.NFT.methods.getHash(id).call();
              const isCollaborator = await _areAddressesColaborator(addresses, hash);
              if (isCollaborator) {
                let value = await contracts.mainnetsidechain.NFT.methods.getMetadata(hash, key).call();
                // console.log('pre value', {value});
                value = jsonParse(value);
                // console.log('final value', {value});
                if (value !== null) {
                  let {ciphertext, tag} = value;
                  ciphertext = Buffer.from(ciphertext, 'base64');
                  tag = Buffer.from(tag, 'base64');
                  // console.log('got ciphertext 1', {ciphertext, tag});
                  value = decodeSecret(encryptionMnemonic, {ciphertext, tag});
                  // console.log('got ciphertext 2', {ciphertext, tag, value});
                }

                res.end(JSON.stringify({
                  ok: true,
                  result: value,
                }));
              } else {
                res.statusCode = 401;
                res.end(JSON.stringify({
                  ok: false,
                  result: null,
                }));
              }
            } else {
              res.statusCode = 400;
              res.end(JSON.stringify({
                ok: false,
                result: null,
              }));
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
const _isCollaborator = async (tokenId, address) => {
  const hash = await contracts.mainnetsidechain.NFT.methods.getHash(tokenId).call();
  return await _areAddressesColaborator([address], hash);
};
const _isSingleCollaborator = async (tokenId, address) => await _areAddressesSingleColaborator([address], tokenId);

module.exports = {
  _handleUnlockRequest,
  _isCollaborator,
  _isSingleCollaborator,
};
