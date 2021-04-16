const url = require('url');
const dns = require('dns');
const fetch = require('node-fetch');
const Web3 = require('web3');
const bip39 = require('bip39');
const { hdkey } = require('ethereumjs-wallet');
const { jsonParse, _setCorsHeaders } = require('../utils.js');
const { polygonVigilKey } = require('../constants.js');

let config = require('fs').existsSync('../../config.json') ? require('../../config.json') : null;

const mainnetMnemonic = process.env.mainnetMnemonic || config.mainnetMnemonic;
const testnetMnemonic = process.env.testnetMnemonic || config.testnetMnemonic;
const polygonMnemonic = process.env.polygonMnemonic || config.polygonMnemonic;
const testnetpolygonMnemonic = process.env.testnetpolygonMnemonic || config.testnetpolygonMnemonic;
const infuraProjectId = process.env.infuraProjectId || config.infuraProjectId;
const encryptionMnemonic = process.env.encryptionMnemonic || config.encryptionMnemonic;

const { createCipheriv, createDecipheriv } = require('crypto');

const unlockableKey = 'unlockable';
const nonce = Buffer.alloc(12);
const encodeSecret = (mnemonic, secret) => {
  const wallet = hdkey.fromMasterSeed(bip39.mnemonicToSeedSync(mnemonic)).derivePath(`m/44'/60'/0'/0/0`).getWallet();
  const privateKey = wallet.privateKey;

  const key = privateKey.slice(0, 24);

  const cipher = createCipheriv('aes-192-ccm', key, nonce, {
    authTagLength: 16
  });
  const ciphertext = cipher.update(secret, 'utf8');
  cipher.final();
  const tag = cipher.getAuthTag();
  return {
    ciphertext,
    tag,
  };
};
const decodeSecret = (mnemonic, { ciphertext, tag }) => {
  const wallet = hdkey.fromMasterSeed(bip39.mnemonicToSeedSync(mnemonic)).derivePath(`m/44'/60'/0'/0/0`).getWallet();
  const privateKey = wallet.privateKey;

  const key = privateKey.slice(0, 24);

  const decipher = createDecipheriv('aes-192-ccm', key, nonce, {
    authTagLength: 16
  });
  decipher.setAuthTag(tag);
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
    testnetsidechain: new Web3(new Web3.providers.HttpProvider(gethNodeUrl + ':8546')),
    polygon: new Web3(new Web3.providers.HttpProvider(`https://rpc-mainnet.maticvigil.com/v1/${polygonVigilKey}`)),
    testnetpolygon: new Web3(new Web3.providers.HttpProvider(`https://rpc-mumbai.maticvigil.com/v1/${polygonVigilKey}`)),
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
          return isC;
        } catch (err) {
          return false;
        }
      })(),
      (async () => {
        try {
          let owner = await contracts.mainnetsidechain.NFT.methods.ownerOf(id).call();
          owner = owner.toLowerCase();
          return owner === address;
        } catch (err) {
          return false;
        }
      })(),
      (async () => {
        try {
          let owner = await contracts.mainnet.NFT.methods.ownerOf(id).call();
          owner = owner.toLowerCase();
          return owner === address;
        } catch (err) {
          return false;
        }
      })(),
    ]);

    isC = isC || _isC;
    isO1 = isO1 || _isO1;
    isO2 = isO2 || _isO2;
  }

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
          return isC;
        } catch (err) {
          return false;
        }
      })(),
      (async () => {
        try {
          let owner = await contracts.mainnetsidechain.NFT.methods.ownerOf(id).call();
          owner = owner.toLowerCase();
          return owner === address;
        } catch (err) {
          return false;
        }
      })(),
      (async () => {
        try {
          let owner = await contracts.mainnet.NFT.methods.ownerOf(id).call();
          owner = owner.toLowerCase();
          return owner === address;
        } catch (err) {
          return false;
        }
      })(),
    ]);
    isC = isC || _isC;
    isO1 = isO1 || _isO1;
    isO2 = isO2 || _isO2;
  }

  return isC || isO1 || isO2;
};
const _handleUnlockRequest = async (req, res) => {
  const { web3, contracts } = await loadPromise;

  const request = url.parse(req.url);
  try {
    res = _setCorsHeaders(res);
    const { method } = req;
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
      const { signatures, id } = j;
      const key = unlockableKey;
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
        const isCollaborator = await _areAddressesColaborator(addresses, hash);
        if (isCollaborator) {
          let value = await contracts.mainnetsidechain.NFT.methods.getMetadata(hash, key).call();
          value = jsonParse(value);
          if (value !== null) {
            let { ciphertext, tag } = value;
            ciphertext = Buffer.from(ciphertext, 'base64');
            tag = Buffer.from(tag, 'base64');
            value = decodeSecret(encryptionMnemonic, { ciphertext, tag });
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
