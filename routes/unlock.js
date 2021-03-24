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
const {_setCorsHeaders} = require('../utils.js');
const {accessKeyId, secretAccessKey, mainnetMnemonic, /* rinkebyMnemonic, */ infuraProjectId, encryptionMnemonic} = require('../config.json');

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
    console.log('unlock request', req.url);
    
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
            const {signature, ciphertext, tag} = j;
            console.log('got sig', {signature, ciphertext, tag});
            let address = null;
            try {
              address = await web3.mainnet.eth.accounts.recover(proofOfAddressMessage, signature);
              address = address.toLowerCase();
            } catch(err) {
              console.warn(err.stack);
            }
            
            if (address !== null) {
              const _getAllUserSpecs = async () => {
                const o = await ddb.scan({
                  TableName: tableName,
                }).promise();
 
                /* ({
                  TableName: tableName,
                  Item: {
                    email: {S: id + '.discordtoken'},
                    mnemonic: {S: mnemonic},
                    address: {S: address},
                  }
                }).promise(); */
                const specs = o.Items.map(i => {
                  console.log('got i', i);
                  const {mnemonic} = i;
                  const wallet = hdkey.fromMasterSeed(bip39.mnemonicToSeedSync(mnemonic)).derivePath(`m/44'/60'/0'/0/0`).getWallet();
                  const address = wallet.getAddressString();
                  return {
                    address,
                    mnemonic,
                  };
                });
                return specs;
              };
              const _findUser = async address => {
                const specs = await _getAllUserSpecs();
                const spec = specs.find(s => s.address === address) || null;
                return spec;
              };
              
              console.log('get user 1', address);
              const user = await _findUser(address);
              console.log('get user 2', address, user);
              // const {mnemonic} = user;
              const result = decodeSecret(encryptionMnemonic, {ciphertext, tag});
              
              res.end(JSON.stringify({
                ok: true,
                result,
              }));
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

module.exports = {
  _handleUnlockRequest,
};
