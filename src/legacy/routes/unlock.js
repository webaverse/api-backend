const dns = require('dns');
const fetch = require('node-fetch');
const Web3 = require('web3');
const bip39 = require('bip39');
const {hdkey} = require('ethereumjs-wallet');

const {jsonParse, setCorsHeaders} = require('../../utils.js');
const {areAddressesCollaborator} = require('../../blockchain.js');
const {encodeSecret, decodeSecret} = require('../../crypto');
const {
  MAINNET_MNEMONIC,
  TESTNET_MNEMONIC,
  POLYGON_MNEMONIC,
  TESTNET_POLYGON_MNEMONIC,
  INFURA_PROJECT_ID,
  ENCRYPTION_MNEMONIC,
  POLYGON_VIGIL_KEY,
  unlockableMetadataKey,
  encryptedMetadataKey,
  ETHEREUM_HOST,
  STORAGE_HOST,
  proofOfAddressMessage
} = require('../../constants.js');

let contracts, gethNodeUrl = null;
const loadPromise = (async () => {
  const ethereumHostAddress = await new Promise((accept, reject) => {
    dns.resolve4(ETHEREUM_HOST, (err, addresses) => {
      if (!err) {
        if (addresses.length > 0) {
          accept(addresses[0]);
        } else {
          reject(new Error('no addresses resolved for ' + ETHEREUM_HOST));
        }
      } else {
        reject(err);
      }
    });
  });

  gethNodeUrl = `http://${ethereumHostAddress}`;

  const web3 = {
    mainnet: new Web3(new Web3.providers.HttpProvider(`https://mainnet.infura.io/v3/${INFURA_PROJECT_ID}`)),
    mainnetsidechain: new Web3(new Web3.providers.HttpProvider(gethNodeUrl + ':8545')),
    testnet: new Web3(new Web3.providers.HttpProvider(`https://rinkeby.infura.io/v3/${INFURA_PROJECT_ID}`)),
    testnetsidechain: new Web3(new Web3.providers.HttpProvider(gethNodeUrl + ':8546')),
    polygon: new Web3(new Web3.providers.HttpProvider(`https://rpc-mainnet.maticvigil.com/v1/${POLYGON_VIGIL_KEY}`)),
    testnetpolygon: new Web3(new Web3.providers.HttpProvider(`https://rpc-mumbai.maticvigil.com/v1/${POLYGON_VIGIL_KEY}`)),
  };
  const addresses = await fetch('https://contracts.webaverse.com/config/addresses.js').then(res => res.text()).then(s => JSON.parse(s.replace(/^\s*export\s*default\s*/, '')));
  const abis = await fetch('https://contracts.webaverse.com/config/abi.js').then(res => res.text()).then(s => JSON.parse(s.replace(/^\s*export\s*default\s*/, '')));
  const chainIds = await fetch('https://contracts.webaverse.com/config/chain-id.js').then(res => res.text()).then(s => JSON.parse(s.replace(/^\s*export\s*default\s*/, '')));
  contracts = await (async () => {
    const result = {};
    [
      'mainnet',
      'mainnetsidechain',
      'testnet',
      'testnetsidechain',
      'polygon',
      'testnetpolygon',
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
    mainnet: hdkey.fromMasterSeed(bip39.mnemonicToSeedSync(MAINNET_MNEMONIC)).derivePath(`m/44'/60'/0'/0/0`).getWallet(),
    testnet: hdkey.fromMasterSeed(bip39.mnemonicToSeedSync(TESTNET_MNEMONIC)).derivePath(`m/44'/60'/0'/0/0`).getWallet(),
    polygon: hdkey.fromMasterSeed(bip39.mnemonicToSeedSync(POLYGON_MNEMONIC)).derivePath(`m/44'/60'/0'/0/0`).getWallet(),
    testnetpolygon: hdkey.fromMasterSeed(bip39.mnemonicToSeedSync(TESTNET_POLYGON_MNEMONIC)).derivePath(`m/44'/60'/0'/0/0`).getWallet(),
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

const handleUnlockRequest = async (req, res) => {
  const {web3, contracts} = await loadPromise;
  try {
    res = setCorsHeaders(res);
    const {method} = req;
    if (method === 'OPTIONS') {
      res.end();
    } else if (method === 'POST') {
      const jsonDataToUnlock = await new Promise((accept, reject) => {
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

      const {signatures, id} = jsonDataToUnlock;
      const key = unlockableMetadataKey;
      const addresses = [];
      let ok = true;
      for (const signature of signatures) {
        try {
          let address = await web3.mainnetsidechain.eth.accounts.recover(proofOfAddressMessage, signature);
          address = address.toLowerCase();
          addresses.push(address);
        } catch (err) {
          console.warn(err.stack);
          ok = false;
        }
      }

      if (ok) {
        const hash = await contracts.mainnetsidechain.NFT.methods.getHash(id).call();
        const isCollaborator = await areAddressesCollaborator(addresses, hash, id);
        if (isCollaborator) {
          let value = await contracts.mainnetsidechain.NFT.methods.getMetadata(hash, key).call();
          value = jsonParse(value);
          if (value !== null && typeof value.ciphertext === 'string' && typeof value.tag === 'string') {
            let {ciphertext, tag} = value;
            ciphertext = Buffer.from(ciphertext, 'base64');
            tag = Buffer.from(tag, 'base64');
            value = decodeSecret(ENCRYPTION_MNEMONIC, id, {ciphertext, tag}, 'utf8');
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
};

const handleLockRequest = async (req, res) => {
  try {
    res = setCorsHeaders(res);
    const {method} = req;
    if (method === 'OPTIONS') {
      res.end();
    } else if (method === 'POST') {
      let match, id;
      if ((match = req.url.match(/^\/([0-9]+)$/)) && !isNaN(id = match && parseInt(match[1], 10))) {
        const bufferToEncrypt = await new Promise((accept, reject) => {
          const bufferString = [];
          req.on('data', d => {
            bufferString.push(d);
          });
          req.on('end', () => {
            const b = Buffer.concat(bufferString);
            bufferString.length = 0;
            accept(b);
          });
          req.on('error', reject);
        });

        let {ciphertext, tag} = encodeSecret(ENCRYPTION_MNEMONIC, id, bufferToEncrypt);
        tag = tag.toString('base64');

        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('tag', tag);
        res.end(ciphertext);
      } else {
        res.statusCode = 400;
        res.end('invalid id');
      }
    } else {
      res.statusCode = 404;
      res.end('not found');
    }
  } catch (err) {
    console.log(err);
    res.statusCode = 500;
    res.end(err.stack);
  }
};

const handleDecryptRequest = async (req, res) => {
  const {web3, contracts} = await loadPromise;
  try {
    res = setCorsHeaders(res);
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
          const j = jsonParse(s);
          accept(j);
        });
        req.on('error', reject);
      });
      const {signatures, id} = j || {};

      if (Array.isArray(signatures) && signatures.every(signature => typeof signature === 'string') && typeof id === 'number') {
        const key = encryptedMetadataKey;
        const addresses = [];
        let ok = true;
        for (const signature of signatures) {
          try {
            let address = await web3.mainnetsidechain.eth.accounts.recover(proofOfAddressMessage, signature);
            address = address.toLowerCase();
            addresses.push(address);
          } catch (err) {
            console.warn(err.stack);
            ok = false;
          }
        }

        if (ok) {
          const hash = await contracts.mainnetsidechain.NFT.methods.getHash(id).call();
          const isCollaborator = await areAddressesCollaborator(addresses, hash, id);
          if (isCollaborator) {
            let value = await contracts.mainnetsidechain.NFT.methods.getMetadata(hash, key).call();
            value = jsonParse(value);
            if (value !== null && typeof value.cipherhash === 'string' && typeof value.tag === 'string') {
              let {cipherhash, tag} = value;

              const ciphertext = await (async () => {
                const res = await fetch(`${STORAGE_HOST}/ipfs/${cipherhash}`);
                const b = await res.buffer();
                return b;
              })();

              tag = Buffer.from(tag, 'base64');
              const plaintext = decodeSecret(ENCRYPTION_MNEMONIC, id, {ciphertext, tag}, null);

              res.setHeader('Content-Type', 'application/octet-stream');
              res.end(plaintext);
            } else {
              res.statusCode = 500;
              res.end('could not decrypt ciphertext');
            }
          } else {
            res.statusCode = 401;
            res.end('not a collaborator');
          }
        } else {
          res.statusCode = 400;
          res.end('signatures invalid');
        }
      } else {
        res.statusCode = 400;
        res.end('invalid arguments');
      }
    } else {
      res.statusCode = 404;
      res.end('not found');
    }
  } catch (err) {
    console.log(err);
    res.statusCode = 500;
    res.end(err.stack);
  }
};

module.exports = {
  handleUnlockRequest,
  handleLockRequest,
  handleDecryptRequest
};
