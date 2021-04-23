const dns = require('dns');
const fetch = require('node-fetch');
const Web3 = require('web3');
const bip39 = require('bip39');
const {hdkey} = require('ethereumjs-wallet');
const {createDecipheriv} = require('crypto');
const {jsonParse, setCorsHeaders} = require('../utils.js');
const {
  MAINNET_MNEMONIC,
  TESTNET_MNEMONIC,
  POLYGON_MNEMONIC,
  TESTNET_POLYGON_MNEMONIC,
  INFURA_PROJECT_ID,
  ENCRYPTION_MNEMONIC,
  POLYGON_VIGIL_KEY,
  unlockableKey,
  ETHEREUM_HOST
} = require('../constants.js');
const {areAddressesCollaborator} = require ('../blockchain.js');

const nonce = Buffer.alloc(12);

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

const decodeSecret = (mnemonic, {ciphertext, tag}) => {
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

const proofOfAddressMessage = `Proof of address.`;

const handleUnlockRequest = async (req, res) => {
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
          const j = JSON.parse(s);
          accept(j);
        });
        req.on('error', reject);
      });
      const {signatures, id} = j;
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
        const isCollaborator = await areAddressesCollaborator(addresses, hash, id);
        if (isCollaborator) {
          let value = await contracts.mainnetsidechain.NFT.methods.getMetadata(hash, key).call();
          value = jsonParse(value);
          if (value !== null) {
            let {ciphertext, tag} = value;
            ciphertext = Buffer.from(ciphertext, 'base64');
            tag = Buffer.from(tag, 'base64');
            value = decodeSecret(ENCRYPTION_MNEMONIC, {ciphertext, tag});
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

module.exports = {
  handleUnlockRequest
};
