const bip39 = require('bip39');
const {hdkey} = require('ethereumjs-wallet');
const {Transaction} = require('@ethereumjs/tx');
const {default: Common} = require('@ethereumjs/common');

const {accountKeys, zeroAddress, defaultAvatarPreview, IPFS_HOST} = require('./constants.js');
const {getBlockchain, getPastEvents} = require('./blockchain.js');
const {makePromise} = require('./utils.js');
const txQueues = [];
let contracts, web3;

(async function () {
  const blockchain = await getBlockchain();
  contracts = blockchain.web3;
  web3 = blockchain.web3;
})();

const runSidechainTransaction = mnemonic => {
  const wallet = hdkey.fromMasterSeed(bip39.mnemonicToSeedSync(mnemonic)).derivePath(`m/44'/60'/0'/0/0`).getWallet();
  const address = wallet.getAddressString();

  const fn = async (contractName, method, ...args) => {
    let entry = txQueues[address];
    if (!entry) {
      entry = {
        running: false,
        cbs: [],
      };
      txQueues[address] = entry;
    }
    if (!entry.running) {
      entry.running = true;

      try {
        const txData = contracts[contractName].methods[method](...args);
        const data = txData.encodeABI();
        let gasPrice = await web3.eth.getGasPrice();
        gasPrice = parseInt(gasPrice, 10);

        const privateKey = wallet.getPrivateKeyString();
        const nonce = await web3.eth.getTransactionCount(address);
        const privateKeyBytes = Uint8Array.from(web3.utils.hexToBytes(privateKey));

        let tx = Transaction.fromTxData({
          to: contracts[contractName]._address,
          nonce: '0x' + new web3.utils.BN(nonce).toString(16),
          gasPrice: '0x' + new web3.utils.BN(gasPrice).toString(16),
          gasLimit: '0x' + new web3.utils.BN(8000000).toString(16),
          data,
        }, {
          common: Common.forCustomChain(
            'mainnet',
            {
              name: 'geth',
              networkId: 1,
              chainId: 1338,
            },
            'petersburg',
          ),
        }).sign(privateKeyBytes);
        const rawTx = '0x' + tx.serialize().toString('hex');

        const receipt = await web3.eth.sendSignedTransaction(rawTx);

        return receipt;
      } finally {
        entry.running = false;

        if (entry.cbs.length > 0) {
          entry.cbs.shift()();
        }
      }
    } else {
      const p = makePromise();
      entry.cbs.push(async () => {
        try {
          const result = await fn(contractName, method, ...args);
          p.accept(result);
        } catch (err) {
          p.reject(err);
        }
      });
      return await p;
    }
  };
  return fn;
};

const _log = async (text, p) => {
  try {
    const r = await p;
    return r;
  } catch (err) {
    console.log('error pull', text, err);
  }
};
function _jsonParse(s) {
  try {
    return JSON.parse(s);
  } catch (err) {
    return null;
  }
}

const _fetchAccountForMinter = async (tokenId, chainName) => {
  const {
    contracts,
  } = await getBlockchain();
  const address = await contracts[chainName].NFT.methods.getMinter(tokenId).call();
  if (address !== zeroAddress) {
    return await _fetchAccount(address, chainName);
  } else {
    return null;
  }
};
const _fetchAccountForOwner = async (tokenId, chainName) => {
  const {
    contracts,
  } = await getBlockchain();
  const address = await contracts[chainName].NFT.methods.ownerOf(tokenId).call();
  if (address !== zeroAddress) {
    return await _fetchAccount(address, chainName);
  } else {
    return null;
  }
};
const _fetchAccount = async (address, chainName) => {
  const {
    contracts,
  } = await getBlockchain();

  const [
    username,
    avatarPreview,
    monetizationPointer,
  ] = await Promise.all([
    (async () => {
      let username = await contracts[chainName].Account.methods.getMetadata(address, 'name').call();
      if (!username) {
        username = 'Anonymous';
      }
      return username;
    })(),
    (async () => {
      let avatarPreview = await contracts[chainName].Account.methods.getMetadata(address, 'avatarPreview').call();
      if (!avatarPreview) {
        avatarPreview = defaultAvatarPreview;
      }
      return avatarPreview;
    })(),
    (async () => {
      let monetizationPointer = await contracts[chainName].Account.methods.getMetadata(address, 'monetizationPointer').call();
      if (!monetizationPointer) {
        monetizationPointer = '';
      }
      return monetizationPointer;
    })(),
  ]);

  return {
    address,
    username,
    avatarPreview,
    monetizationPointer,
  };
};
const _filterByTokenId = tokenId => entry => {
  return parseInt(entry.returnValues.tokenId, 10) === tokenId;
};
const _cancelEntry = (deposits, withdraws, currentLocation, nextLocation, currentAddress) => {
  let candidateWithdrawIndex = -1, candidateDepositIndex = -1;
  withdraws.find((w, i) => {
    const candidateDeposit = deposits.find((d, i) => {
      if (d.returnValues['to'] === w.returnValues['from']) {
        candidateDepositIndex = i;
        return true;
      } else {
        return false;
      }
    });
    if (candidateDeposit) {
      candidateWithdrawIndex = i;
      return true;
    } else {
      return false;
    }
  });
  if (candidateWithdrawIndex !== -1 && candidateDepositIndex !== -1) {
    deposits.splice(candidateDepositIndex, 1);
    const withdraw = withdraws.splice(candidateWithdrawIndex, 1)[0];
    currentLocation = nextLocation;
    currentAddress = withdraw.returnValues['from'];

    return [
      deposits,
      withdraws,
      currentLocation,
      currentAddress,
    ];
  } else if (deposits.length > 0) {
    currentLocation += '-stuck';

    return [
      deposits,
      withdraws,
      currentLocation,
      currentAddress,
    ];
  } else {
    return null;
  }
};
const _cancelEntries = (mainnetDepositedEntries, mainnetWithdrewEntries, sidechainDepositedEntries, sidechainWithdrewEntries, polygonDepositedEntries, polygonWithdrewEntries, currentAddress) => {
  let currentLocation = 'mainnetsidechain';

  console.log('cancel entries', JSON.stringify({
    mainnetDepositedEntries,
    mainnetWithdrewEntries,
    sidechainDepositedEntries,
    sidechainWithdrewEntries,
    polygonDepositedEntries,
    polygonWithdrewEntries,
  }, null, 2));

  // swap transfers
  {
    let changed = true;
    while (changed) {
      changed = false;

      // sidechain -> mainnet
      {
        const result = _cancelEntry(sidechainDepositedEntries, mainnetWithdrewEntries, currentLocation, 'mainnet', currentAddress);
        if (result && !/stuck/.test(result[2])) {
          sidechainDepositedEntries = result[0];
          mainnetWithdrewEntries = result[1];
          currentLocation = result[2];
          currentAddress = result[3];
          changed = true;

          console.log('sidechain -> mainnet', !/stuck/.test(result[2]), currentLocation, currentAddress, JSON.stringify({
            mainnetDepositedEntries: mainnetDepositedEntries.length,
            mainnetWithdrewEntries: mainnetWithdrewEntries.length,
            sidechainDepositedEntries: sidechainDepositedEntries.length,
            sidechainWithdrewEntries: sidechainWithdrewEntries.length,
            polygonDepositedEntries: polygonDepositedEntries.length,
            polygonWithdrewEntries: polygonWithdrewEntries.length,
          }));

          {
            const result2 = _cancelEntry(mainnetDepositedEntries, sidechainWithdrewEntries, currentLocation, 'mainnetsidechain', currentAddress);
            if (result2 && !/stuck/.test(result2[2])) {
              mainnetDepositedEntries = result2[0];
              sidechainWithdrewEntries = result2[1];
              currentLocation = result2[2];
              currentAddress = result2[3];
              changed = true;

              console.log('mainnet -> sidechain', !/stuck/.test(result[2]), currentLocation, currentAddress, JSON.stringify({
                mainnetDepositedEntries: mainnetDepositedEntries.length,
                mainnetWithdrewEntries: mainnetWithdrewEntries.length,
                sidechainDepositedEntries: sidechainDepositedEntries.length,
                sidechainWithdrewEntries: sidechainWithdrewEntries.length,
                polygonDepositedEntries: polygonDepositedEntries.length,
                polygonWithdrewEntries: polygonWithdrewEntries.length,
              }));
            } else {
              console.log('mainnet -> sidechain', null, currentLocation, currentAddress, JSON.stringify({
                mainnetDepositedEntries: mainnetDepositedEntries.length,
                mainnetWithdrewEntries: mainnetWithdrewEntries.length,
                sidechainDepositedEntries: sidechainDepositedEntries.length,
                sidechainWithdrewEntries: sidechainWithdrewEntries.length,
                polygonDepositedEntries: polygonDepositedEntries.length,
                polygonWithdrewEntries: polygonWithdrewEntries.length,
              }));
            }
          }
        } else {
          console.log('sidechain -> mainnet', null, currentLocation, currentAddress, JSON.stringify({
            mainnetDepositedEntries: mainnetDepositedEntries.length,
            mainnetWithdrewEntries: mainnetWithdrewEntries.length,
            sidechainDepositedEntries: sidechainDepositedEntries.length,
            sidechainWithdrewEntries: sidechainWithdrewEntries.length,
            polygonDepositedEntries: polygonDepositedEntries.length,
            polygonWithdrewEntries: polygonWithdrewEntries.length,
          }));
        }
      }

      // sidechain -> polygon
      {
        const result = _cancelEntry(sidechainDepositedEntries, polygonWithdrewEntries, currentLocation, 'polygon', currentAddress);
        if (result && !/stuck/.test(result[2])) {
          sidechainDepositedEntries = result[0];
          polygonWithdrewEntries = result[1];
          currentLocation = result[2];
          currentAddress = result[3];
          changed = true;

          console.log('sidechain -> polygon', !/stuck/.test(result[2]), currentLocation, currentAddress, JSON.stringify({
            mainnetDepositedEntries: mainnetDepositedEntries.length,
            mainnetWithdrewEntries: mainnetWithdrewEntries.length,
            sidechainDepositedEntries: sidechainDepositedEntries.length,
            sidechainWithdrewEntries: sidechainWithdrewEntries.length,
            polygonDepositedEntries: polygonDepositedEntries.length,
            polygonWithdrewEntries: polygonWithdrewEntries.length,
          }));

          const result2 = _cancelEntry(polygonDepositedEntries, sidechainWithdrewEntries, currentLocation, 'mainnetsidechain', currentAddress);
          if (result2 && !/stuck/.test(result2[2])) {
            polygonDepositedEntries = result2[0];
            sidechainWithdrewEntries = result2[1];
            currentLocation = result2[2];
            currentAddress = result2[3];
            changed = true;

            console.log('polygon -> sidechain', !/stuck/.test(result[2]), currentLocation, currentAddress, JSON.stringify({
              mainnetDepositedEntries: mainnetDepositedEntries.length,
              mainnetWithdrewEntries: mainnetWithdrewEntries.length,
              sidechainDepositedEntries: sidechainDepositedEntries.length,
              sidechainWithdrewEntries: sidechainWithdrewEntries.length,
              polygonDepositedEntries: polygonDepositedEntries.length,
              polygonWithdrewEntries: polygonWithdrewEntries.length,
            }));
          } else {
            console.log('polygon -> sidechain', null, currentLocation, currentAddress, JSON.stringify({
              mainnetDepositedEntries,
              mainnetWithdrewEntries,
              sidechainDepositedEntries,
              sidechainWithdrewEntries,
              polygonDepositedEntries,
              polygonWithdrewEntries,
            }, null, 2));
          }
        } else {
          console.log('sidechain -> polygon', null, currentLocation, currentAddress, JSON.stringify({
            mainnetDepositedEntries: mainnetDepositedEntries.length,
            mainnetWithdrewEntries: mainnetWithdrewEntries.length,
            sidechainDepositedEntries: sidechainDepositedEntries.length,
            sidechainWithdrewEntries: sidechainWithdrewEntries.length,
            polygonDepositedEntries: polygonDepositedEntries.length,
            polygonWithdrewEntries: polygonWithdrewEntries.length,
          }));
        }
      }
    }
    console.log('loop end');
  }
  // self transfer
  {
    let changed = true;
    while (changed) {
      changed = false;

      // sidechain -> sidechain
      {
        const result = _cancelEntry(sidechainDepositedEntries, sidechainWithdrewEntries, currentLocation, 'mainnetsidechain', currentAddress);
        if (result && !/stuck/.test(result[2])) {
          sidechainDepositedEntries = result[0];
          sidechainWithdrewEntries = result[1];
          // currentLocation = result[2];
          // currentAddress = result[3];
          changed = true;

          console.log('sidechain -> sidechain', !/stuck/.test(result[2]), currentLocation, currentAddress, JSON.stringify({
            mainnetDepositedEntries: mainnetDepositedEntries.length,
            mainnetWithdrewEntries: mainnetWithdrewEntries.length,
            sidechainDepositedEntries: sidechainDepositedEntries.length,
            sidechainWithdrewEntries: sidechainWithdrewEntries.length,
            polygonDepositedEntries: polygonDepositedEntries.length,
            polygonWithdrewEntries: polygonWithdrewEntries.length,
          }));
        } else {
          console.log('sidechain -> sidechain', null, currentLocation, currentAddress, JSON.stringify({
            mainnetDepositedEntries: mainnetDepositedEntries.length,
            mainnetWithdrewEntries: mainnetWithdrewEntries.length,
            sidechainDepositedEntries: sidechainDepositedEntries.length,
            sidechainWithdrewEntries: sidechainWithdrewEntries.length,
            polygonDepositedEntries: polygonDepositedEntries.length,
            polygonWithdrewEntries: polygonWithdrewEntries.length,
          }));
        }
      }
      // mainnet -> mainnet
      {
        const result = _cancelEntry(mainnetDepositedEntries, mainnetWithdrewEntries, currentLocation, 'mainnet', currentAddress);
        if (result && !/stuck/.test(result[2])) {
          mainnetDepositedEntries = result[0];
          mainnetWithdrewEntries = result[1];
          // currentLocation = result[2];
          // currentAddress = result[3];
          changed = true;

          console.log('mainnet -> mainnet', !/stuck/.test(result[2]), currentLocation, currentAddress, JSON.stringify({
            mainnetDepositedEntries: mainnetDepositedEntries.length,
            mainnetWithdrewEntries: mainnetWithdrewEntries.length,
            sidechainDepositedEntries: sidechainDepositedEntries.length,
            sidechainWithdrewEntries: sidechainWithdrewEntries.length,
            polygonDepositedEntries: polygonDepositedEntries.length,
            polygonWithdrewEntries: polygonWithdrewEntries.length,
          }));
        } else {
          console.log('mainnet -> mainnet', null, currentLocation, currentAddress, JSON.stringify({
            mainnetDepositedEntries: mainnetDepositedEntries.length,
            mainnetWithdrewEntries: mainnetWithdrewEntries.length,
            sidechainDepositedEntries: sidechainDepositedEntries.length,
            sidechainWithdrewEntries: sidechainWithdrewEntries.length,
            polygonDepositedEntries: polygonDepositedEntries.length,
            polygonWithdrewEntries: polygonWithdrewEntries.length,
          }));
        }
      }
      // polygon -> polygon
      {
        const result = _cancelEntry(polygonDepositedEntries, polygonWithdrewEntries, currentLocation, 'polygon', currentAddress);
        if (result && !/stuck/.test(result[2])) {
          polygonDepositedEntries = result[0];
          polygonWithdrewEntries = result[1];
          // currentLocation = result[2];
          // currentAddress = result[3];
          changed = true;

          console.log('polygon -> polygon', !/stuck/.test(result[2]), currentLocation, currentAddress, JSON.stringify({
            mainnetDepositedEntries: mainnetDepositedEntries.length,
            mainnetWithdrewEntries: mainnetWithdrewEntries.length,
            sidechainDepositedEntries: sidechainDepositedEntries.length,
            sidechainWithdrewEntries: sidechainWithdrewEntries.length,
            polygonDepositedEntries: polygonDepositedEntries.length,
            polygonWithdrewEntries: polygonWithdrewEntries.length,
          }));
        } else {
          console.log('polygon -> polygon', null, currentLocation, currentAddress, JSON.stringify({
            mainnetDepositedEntries: mainnetDepositedEntries.length,
            mainnetWithdrewEntries: mainnetWithdrewEntries.length,
            sidechainDepositedEntries: sidechainDepositedEntries.length,
            sidechainWithdrewEntries: sidechainWithdrewEntries.length,
            polygonDepositedEntries: polygonDepositedEntries.length,
            polygonWithdrewEntries: polygonWithdrewEntries.length,
          }));
        }
      }
    }
  }
  if ([
    mainnetDepositedEntries,
    sidechainDepositedEntries,
    polygonDepositedEntries,
  ].some(depositedEntries => depositedEntries.length > 0)) {
    currentLocation += '-stuck';
  }

  return [
    mainnetDepositedEntries,
    mainnetWithdrewEntries,
    sidechainDepositedEntries,
    sidechainWithdrewEntries,
    polygonDepositedEntries,
    polygonWithdrewEntries,
    currentLocation,
    currentAddress,
  ];
};

const formatToken = chainName => async (token, storeEntries, mainnetDepositedEntries, mainnetWithdrewEntries, sidechainDepositedEntries, sidechainWithdrewEntries, polygonDepositedEntries, polygonWithdrewEntries) => {

  const tokenId = parseInt(token.id, 10);
  const {name, ext, unlockable, hash} = token;

  const {
    contracts,
  } = await getBlockchain();

  const {
    sidechainChainName,
  } = getChainNames(chainName);

  let [
    minter,
    owner,
    description,
    sidechainMinterAddress,
  ] = await Promise.all([
    _log('formatToken 1' + JSON.stringify({id: token.id}), _fetchAccountForMinter(tokenId, sidechainChainName)),
    _log('formatToken 2' + JSON.stringify({id: token.id}), _fetchAccountForOwner(tokenId, sidechainChainName)),
    _log('formatToken 3' + JSON.stringify({id: token.id}), contracts[sidechainChainName].NFT.methods.getMetadata(token.hash, 'description').call()),
    contracts[sidechainChainName].NFT.methods.getMinter(tokenId).call(),
  ]);

  // console.log('got all contract sources', {id: token.id});

  /* console.log('got entries 1', {
    mainnetDepositedEntries,
    mainnetWithdrewEntries,
    sidechainDepositedEntries,
    sidechainWithdrewEntries,
    polygonDepositedEntries,
    polygonWithdrewEntries,
  }); */

  const _filterByTokenIdLocal = _filterByTokenId(tokenId);
  mainnetDepositedEntries = mainnetDepositedEntries.filter(_filterByTokenIdLocal);
  mainnetWithdrewEntries = mainnetWithdrewEntries.filter(_filterByTokenIdLocal);
  sidechainDepositedEntries = sidechainDepositedEntries.filter(_filterByTokenIdLocal);
  sidechainWithdrewEntries = sidechainWithdrewEntries.filter(_filterByTokenIdLocal);
  polygonDepositedEntries = polygonDepositedEntries.filter(_filterByTokenIdLocal);
  polygonWithdrewEntries = polygonWithdrewEntries.filter(_filterByTokenIdLocal);

  // console.log('filter by token id', tokenId, JSON.stringify({sidechainDepositedEntries}, null, 2));

  const result = _cancelEntries(
    mainnetDepositedEntries,
    mainnetWithdrewEntries,
    sidechainDepositedEntries,
    sidechainWithdrewEntries,
    polygonDepositedEntries,
    polygonWithdrewEntries,
    sidechainMinterAddress,
  );
  mainnetDepositedEntries = result[0];
  mainnetWithdrewEntries = result[1];
  sidechainWithdrewEntries = result[2];
  sidechainWithdrewEntries = result[3];
  polygonDepositedEntries = result[4];
  polygonWithdrewEntries = result[5];
  const currentLocation = result[6];
  sidechainMinterAddress = result[7];

  /* console.log('got entries 2', {
    mainnetDepositedEntries,
    mainnetWithdrewEntries,
    sidechainWithdrewEntries,
    sidechainWithdrewEntries,
    polygonDepositedEntries,
    polygonWithdrewEntries,
  }); */

  // console.log('mainnet withdrew entries', sidechainDepositedEntries);

  /* const isStuckForward = sidechainDepositedEntries.length > 0;
  const isStuckBackwardMainnet = mainnetDepositedEntries.length > 0;
  const isStuckBackwardPolygon = polygonDepositedEntries.length > 0;

  if (tokenId === 1) {
    console.log('entries for token 1', {
      mainnetDepositedEntries,
      mainnetWithdrewEntries,
      sidechainDepositedEntries,
      sidechainWithdrewEntries,
      polygonDepositedEntries,
      polygonWithdrewEntries,
      currentLocation,
    });
  } */

  const storeEntry = storeEntries.find(entry => entry.tokenId === tokenId);
  const buyPrice = storeEntry ? storeEntry.price : null;
  const storeId = storeEntry ? storeEntry.id : null;
  const o = {
    id: tokenId,
    name,
    description,
    image: 'https://preview.exokit.org/' + hash + '.' + ext + '/preview.png',
    external_url: 'https://app.webaverse.com?h=' + hash,
    animation_url: `${IPFS_HOST}/${hash}/preview.${ext === 'vrm' ? 'glb' : ext}`,
    properties: {
      name,
      hash,
      ext,
      unlockable,
    },
    minterAddress: minter.address.toLowerCase(),
    minter,
    ownerAddress: owner.address.toLowerCase(),
    owner,
    currentOwnerAddress: sidechainMinterAddress.toLowerCase(),
    balance: parseInt(token.balance, 10),
    totalSupply: parseInt(token.totalSupply, 10),
    buyPrice,
    storeId,
    currentLocation,
  };
  console.log('got token', JSON.stringify(o, null, 2));
  return o;
};
const formatLand = chainName => async (token) => {
  const {
    contracts,
  } = await getBlockchain();

  const {
    sidechainChainName,
  } = getChainNames(chainName);

  const owner = await _fetchAccount(token.owner, sidechainChainName);

  const tokenId = parseInt(token.id, 10);
  const {name, hash, ext, unlockable} = token;
  const [
    description,
    rarity,
    extents,
  ] = await Promise.all([
    contracts[chainName].LAND.methods.getSingleMetadata(tokenId, 'description').call(),
    contracts[chainName].LAND.methods.getMetadata(name, 'rarity').call(),
    contracts[chainName].LAND.methods.getMetadata(name, 'extents').call(),
    contracts[sidechainChainName].LAND.methods.getMinter(tokenId).call(),
  ]);
  const extentsJson = _jsonParse(extents);
  const coord = (
    extentsJson && extentsJson[0] &&
    typeof extentsJson[0][0] === 'number' && typeof extentsJson[0][1] === 'number' && typeof extentsJson[0][2] === 'number' &&
    typeof extentsJson[1][0] === 'number' && typeof extentsJson[1][1] === 'number' && typeof extentsJson[1][2] === 'number'
  ) ? [
    (extentsJson[1][0] + extentsJson[0][0]) / 2,
    (extentsJson[1][1] + extentsJson[0][1]) / 2,
    (extentsJson[1][2] + extentsJson[0][2]) / 2,
  ] : null;
  return {
    id: tokenId,
    name,
    description,
    image: coord ? `https://land-preview.exokit.org/32/${coord[0]}/${coord[2]}?${extentsJson ? `e=${JSON.stringify(extentsJson)}` : ''}` : null,
    external_url: `https://app.webaverse.com?${coord ? `c=${JSON.stringify(coord)}` : ''}`,
    properties: {
      name,
      hash,
      rarity,
      extents,
      ext,
      unlockable,
    },
    owner,
    balance: parseInt(token.balance, 10),
    totalSupply: parseInt(token.totalSupply, 10)
  };
};
const _copy = o => {
  const oldO = o;
  // copy array
  const newO = JSON.parse(JSON.stringify(oldO));
  // decorate array
  for (const k in oldO) {
    newO[k] = oldO[k];
  }
  return newO;
};
const _isValidToken = token => token.owner !== zeroAddress;
const getChainNft = contractName => chainName => async (tokenId, storeEntries, mainnetDepositedEntries, mainnetWithdrewEntries, sidechainDepositedEntries, sidechainWithdrewEntries, polygonDepositedEntries, polygonWithdrewEntries) => {
  if (!storeEntries || !mainnetDepositedEntries || !mainnetWithdrewEntries || !sidechainDepositedEntries || !sidechainWithdrewEntries || !polygonDepositedEntries || !polygonWithdrewEntries) {
    console.warn('bad arguments were', {
      storeEntries,
      mainnetDepositedEntries,
      mainnetWithdrewEntries,
      sidechainDepositedEntries,
      sidechainWithdrewEntries,
      polygonDepositedEntries,
      polygonWithdrewEntries,
    });
    throw new Error('invalid arguments');
  }

  chainName = 'mainnetsidechain'; // XXX hack; get rid of this argument

  const {
    contracts,
  } = await getBlockchain();

  const [
    token,
  ] = await Promise.all([
    (async () => {
      const tokenSrc = await contracts[chainName][contractName].methods.tokenByIdFull(tokenId).call();
      const token = _copy(tokenSrc);
      const {hash} = token;
      token.unlockable = await contracts[chainName].NFT.methods.getMetadata(hash, 'unlockable').call();
      if (!token.unlockable) {
        token.unlockable = '';
      }
      return token;
    })(),
  ]);

  try {
    if (_isValidToken(token)) {
      if (contractName === 'NFT') {
        const r = await formatToken(chainName)(
          token,
          storeEntries,
          mainnetDepositedEntries,
          mainnetWithdrewEntries,
          sidechainDepositedEntries,
          sidechainWithdrewEntries,
          polygonDepositedEntries,
          polygonWithdrewEntries,
        );
        return r;
      } else if (contractName === 'LAND') {
        return await formatLand(chainName)(
          token,
          mainnetDepositedEntries,
          mainnetWithdrewEntries,
          sidechainDepositedEntries,
          sidechainWithdrewEntries,
          polygonDepositedEntries,
          polygonWithdrewEntries,
        );
      } else {
        return null;
      }
    } else {
      return null;
    }
  } catch (err) {
    console.warn(err);
    return null;
  }
};
const getChainToken = getChainNft('NFT');

async function getChainAccount({
  address,
  chainName,
} = {}) {
  const {contracts} = await getBlockchain();
  const contract = contracts[chainName];

  const account = {
    address,
  };

  await Promise.all(accountKeys.map(async accountKey => {
    const accountValue = await contract.Account.methods.getMetadata(address, accountKey).call();
    account[accountKey] = accountValue;
  }));

  return account;
}

const getStoreEntries = async chainName => {
  const {
    contracts,
  } = await getBlockchain();

  const numStores = await contracts[chainName].Trade.methods.numStores().call();

  const promises = Array(numStores);

  for (let i = 0; i < numStores; i++) {
    promises[i] =
      contracts[chainName].Trade.methods.getStoreByIndex(i + 1)
        .call()
        .then(store => {
          if (store.live) {
            const id = parseInt(store.id, 10);
            const seller = store.seller.toLowerCase();
            const tokenId = parseInt(store.tokenId, 10);
            const price = parseInt(store.price, 10);
            return {
              id,
              seller,
              tokenId,
              price,
            };
          } else {
            return null;
          }
        });
  }
  let storeEntries = await Promise.all(promises);
  storeEntries = storeEntries.filter(store => store !== null);
  return storeEntries;
};
const getChainNames = chainName => {
  let mainnetChainName = chainName.replace(/polygon/, 'mainnet').replace(/sidechain/, '');
  if (mainnetChainName === '') {
    mainnetChainName = 'mainnet';
  }
  const sidechainChainName = mainnetChainName + 'sidechain';
  const polygonChainName = mainnetChainName.replace(/mainnet/, '') + 'polygon';
  return {
    mainnetChainName,
    sidechainChainName,
    polygonChainName,
  };
};
const getAllWithdrawsDeposits = contractName => async chainName => {
  const {
    mainnetChainName,
    sidechainChainName,
    polygonChainName,
  } = getChainNames(chainName);

  const [
    mainnetDepositedEntries,
    mainnetWithdrewEntries,
    sidechainDepositedEntries,
    sidechainWithdrewEntries,
    polygonDepositedEntries,
    polygonWithdrewEntries,
  ] = await Promise.all([
    _log('getAllWithdrawsDeposits 1', getPastEvents({
      chainName: mainnetChainName,
      contractName: contractName + 'Proxy',
      eventName: 'Deposited',
      fromBlock: 0,
      toBlock: 'latest',
    })),
    _log('getAllWithdrawsDeposits 2', getPastEvents({
      chainName: mainnetChainName,
      contractName: contractName + 'Proxy',
      eventName: 'Withdrew',
      fromBlock: 0,
      toBlock: 'latest',
    })),
    _log('getAllWithdrawsDeposits 3', getPastEvents({
      chainName: sidechainChainName,
      contractName: contractName + 'Proxy',
      eventName: 'Deposited',
      fromBlock: 0,
      toBlock: 'latest',
    })),
    _log('getAllWithdrawsDeposits 4', getPastEvents({
      chainName: sidechainChainName,
      contractName: contractName + 'Proxy',
      eventName: 'Withdrew',
      fromBlock: 0,
      toBlock: 'latest',
    })),
    _log('getAllWithdrawsDeposits 5', getPastEvents({
      chainName: polygonChainName,
      contractName: contractName + 'Proxy',
      eventName: 'Deposited',
      fromBlock: 0,
      toBlock: 'latest',
    })),
    _log('getAllWithdrawsDeposits 6', getPastEvents({
      chainName: polygonChainName,
      contractName: contractName + 'Proxy',
      eventName: 'Withdrew',
      fromBlock: 0,
      toBlock: 'latest',
    })),
  ]);

  return {
    mainnetDepositedEntries,
    mainnetWithdrewEntries,
    sidechainDepositedEntries,
    sidechainWithdrewEntries,
    polygonDepositedEntries,
    polygonWithdrewEntries,
  };
};

module.exports = {
  getChainNft,
  getChainAccount,
  getChainToken,
  getStoreEntries,
  getAllWithdrawsDeposits,
  runSidechainTransaction
};