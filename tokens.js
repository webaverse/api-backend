const {accountKeys, storageHost} = require('./constants.js');
const {getBlockchain, getPastEvents} = require('./blockchain.js');

const zeroAddress = '0x0000000000000000000000000000000000000000';
const defaultAvatarPreview = `https://preview.exokit.org/[https://raw.githubusercontent.com/avaer/vrm-samples/master/vroid/male.vrm]/preview.png`;
const _log = async (text, p) => {
  // console.log('start pull', text);
  try {
    const r = await p;
    // console.log('ok pull', text, JSON.stringify(r).slice(0, 80));
    return r;
  } catch(err) {
    console.log('error pull', text, err);
  }
  // console.log('end pull', text);
};
function _jsonParse(s) {
  try {
    return JSON.parse(s);
  } catch(err) {
    return null;
  }
}

const _fetchAccount = async (tokenId, chainName) => {
  const {
    contracts,
  } = await getBlockchain();
  
  const address = await contracts[chainName].NFT.methods.getMinter(tokenId).call();
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
  // console.log('got entry', entry);
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

    // console.log('sliced 1');

    return [
      deposits,
      withdraws,
      currentLocation,
      currentAddress,
    ];
  } else if (deposits.length > 0) {
    currentLocation += '-stuck';

    // console.log('sliced 2');

    return [
      deposits,
      withdraws,
      currentLocation,
      currentAddress,
    ];
  } else {
    // console.log('sliced 3');
    
    return null;
  }
};
const _cancelEntries = (mainnetDepositedEntries, mainnetWithdrewEntries, sidechainDepositedEntries, sidechainWithdrewEntries, polygonDepositedEntries, polygonWithdrewEntries, currentAddress) => {
  let currentLocation = 'mainnetsidechain';
  
  // direct transfer
  {
    let changed = true;
    while (changed) {
      changed = false;
      
      // sidechain -> sidechain
      {
        const result = _cancelEntry(sidechainDepositedEntries, sidechainWithdrewEntries, currentLocation, 'mainnetsidechain', currentAddress);
        if (result) {
          sidechainDepositedEntries = result[0];
          sidechainWithdrewEntries = result[1];
          if (!/stuck/.test(result[2])) {
            currentLocation = result[2];
            currentAddress = result[3];
            changed = true;
          }
        }
      }
      // TODO: do this for every one of the self-chain pairs
      
      // sidechain -> mainnet
      {
        const result = _cancelEntry(sidechainDepositedEntries, mainnetWithdrewEntries, currentLocation, 'mainnet', currentAddress);
        if (result) {
          if (!/stuck/.test(result[2])) {
            sidechainDepositedEntries = result[0];
            mainnetWithdrewEntries = result[1];
            currentLocation = result[2];
            currentAddress = result[3];
            changed = true;
          
            {
              const result2 = _cancelEntry(mainnetDepositedEntries, sidechainWithdrewEntries, currentLocation, 'mainnetsidechain', currentAddress);
              if (result2) {
                if (!/stuck/.test(result2[2])) {
                  mainnetDepositedEntries = result2[0];
                  sidechainWithdrewEntries = result2[1];
                  currentLocation = result2[2];
                  currentAddress = result2[3];
                  changed = true;
                }
              }
            }
          }
        }
      }
      
      // sidechain -> polygon
      {
        console.log('check start', {
          sidechainDepositedEntries,
          polygonWithdrewEntries,
        });
        const result = _cancelEntry(sidechainDepositedEntries, polygonWithdrewEntries, currentLocation, 'polygon', currentAddress);
        console.log('check end', {
          sidechainDepositedEntries,
          polygonWithdrewEntries,
        }, result);
        if (result) {
          if (!/stuck/.test(result[2])) {
            polygonDepositedEntries = result[0];
            polygonWithdrewEntries = result[1];
            currentLocation = result[2];
            currentAddress = result[3];
            changed = true;
          
            const result2 = _cancelEntry(polygonDepositedEntries, sidechainWithdrewEntries, currentLocation, 'mainnetsidechain', currentAddress);
            if (result2) {
              if (!/stuck/.test(result2[2])) {
                polygonDepositedEntries = result2[0];
                sidechainWithdrewEntries = result2[1];
                currentLocation = result2[2];
                currentAddress = result2[3];
                changed = true;
              }
            }
          }
        }
      }
    }
  }
  if ([
    mainnetDepositedEntries,
    // mainnetWithdrewEntries,
    sidechainDepositedEntries,
    // sidechainWithdrewEntries,
    polygonDepositedEntries,
    // polygonWithdrewEntries,
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

const formatToken = contractName => chainName => async (token, storeEntries, mainnetDepositedEntries, mainnetWithdrewEntries, sidechainDepositedEntries, sidechainWithdrewEntries, polygonDepositedEntries, polygonWithdrewEntries) => {
  // console.log('format token', {id: token.id});
  
  const tokenId = parseInt(token.id, 10);
  const {name, ext, unlockable, hash} = token;

  const {
    contracts,
  } = await getBlockchain();

  const {
    mainnetChainName,
    sidechainChainName,
    polygonChainName,
  } = getChainNames(chainName);

  let [
    minter,
    owner,
    description,
    sidechainMinterAddress,
  ] = await Promise.all([
    _log('formatToken 1' + JSON.stringify({id: token.id}), _fetchAccount(tokenId, sidechainChainName)),
    _log('formatToken 2' + JSON.stringify({id: token.id}), _fetchAccount(tokenId, sidechainChainName)),
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
  return {
    id: tokenId,
    name,
    description,
    image: 'https://preview.exokit.org/' + hash + '.' + ext + '/preview.png',
    external_url: 'https://app.webaverse.com?h=' + hash,
    animation_url: `${storageHost}/${hash}/preview.${ext === 'vrm' ? 'glb' : ext}`,
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
};
const formatLand = contractName => chainName => async (token, storeEntries) => {
  const {
    contracts,
  } = await getBlockchain();

  const {
    mainnetChainName,
    sidechainChainName,
    polygonChainName,
  } = getChainNames(chainName);

  const owner = await _fetchAccount(token.owner, chainName);

  const tokenId = parseInt(token.id, 10);
  // console.log('got token', token);
  const {name, hash, ext, unlockable} = token;
  const [
    description,
    rarity,
    extents,
    sidechainMinterAddress,
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
    (extentsJson[1][0] + extentsJson[0][0])/2,
    (extentsJson[1][1] + extentsJson[0][1])/2,
    (extentsJson[1][2] + extentsJson[0][2])/2,
  ] : null;
  return {
    id,
    name,
    description,
    image: coord ? `https://land-preview.exokit.org/32/${coord[0]}/${coord[2]}?${extentsJson ? `e=${JSON.stringify(extentsJson)}` : ''}` : null,
    external_url: `https://app.webaverse.com?${coord ? `c=${JSON.stringify(coord)}` : ''}`,
    // animation_url: `${storageHost}/${hash}/preview.${ext === 'vrm' ? 'glb' : ext}`,
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
const _isValidToken = token => token.owner !== '0x0000000000000000000000000000000000000000';
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

  const {
    contracts,
  } = await getBlockchain();

  // console.log('get chain nft 1', tokenId);

  const [
    token,
    /* mainnetToken,
    polygonToken, */
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
    /* (async () => {
      if (isSidechain && isAll) {
        const mainnetToken = await contracts[isTestnet ? 'testnet' : 'mainnet'][contractName].methods.tokenByIdFull(tokenId).call();
        return mainnetToken;
      } else {
        return null;
      }
    })(),
    (async () => {
      if (isSidechain && isAll) {
        const polygonToken = await contracts[chainName][contractName].methods.tokenByIdFull(tokenId).call(isTestnet ? 'testnetpolygon' : 'polygon');
        return polygonToken;
      } else {
        return null;
      }
    })(), */
  ]);
  
  // console.log('get chain nft 2', tokenId, token, contractName);
  
  try {
    if (_isValidToken(token)) {
      if (contractName === 'NFT') {
        // console.log('start call');
        const r = await formatToken(contractName)(chainName)(
          token,
          storeEntries,
          mainnetDepositedEntries,
          mainnetWithdrewEntries,
          sidechainDepositedEntries,
          sidechainWithdrewEntries,
          polygonDepositedEntries,
          polygonWithdrewEntries,
        );
        // console.log('end call');
        return r;
      } else if (contractName === 'LAND') {
        return await formatLand(contractName)(chainName)(
          token,
          storeEntries,
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
  } catch(err) {
    console.warn(err);
    return null;
  }
};
const getChainToken = getChainNft('NFT');
const getChainLand = getChainNft('LAND');
const getChainOwnerNft = contractName => chainName => async (address, i, storeEntries, mainnetDepositedEntries, mainnetWithdrewEntries, sidechainDepositedEntries, sidechainWithdrewEntries, polygonDepositedEntries, polygonWithdrewEntries) => {
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
  
  const tokenSrc = await contracts[chainName][contractName].methods.tokenOfOwnerByIndexFull(address, i).call();
  const token = _copy(tokenSrc);
  const {hash} = token;
  token.unlockable = await contracts[chainName][contractName].methods.getMetadata(hash, 'unlockable').call();
  if (!token.unlockable) {
    token.unlockable = '';
  }

  try {
    if (contractName === 'NFT') {
      return await formatToken(contractName)(chainName)(
        token,
        storeEntries,
        mainnetDepositedEntries,
        mainnetWithdrewEntries,
        sidechainDepositedEntries,
        sidechainWithdrewEntries,
        polygonDepositedEntries,
        polygonWithdrewEntries,
      );
    } else if (contractName === 'LAND') {
      return await formatLand(contractName)(chainName)(
        token,
        storeEntries,
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
  } catch(err) {
    console.warn(err);
    return null;
  }
};
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
    // console.log('get value', accountKey, accountValue);
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

  /* const mainnetContract = contracts[mainnetChainName];
  const mainnetProxyContract = mainnetContract[contractName + 'Proxy'];
  const sidechainContract = contracts[sidechainChainName];
  const sidechainProxyContract = sidechainContract[contractName + 'Proxy'];
  const polygonContract = contracts[polygonChainName];
  const polygonProxyContract = polygonContract[contractName + 'Proxy']; */
  
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
  /* console.log('latched', {
    chainName,
    mainnetDepositedEntries,
    mainnetWithdrewEntries,
    sidechainDepositedEntries,
    sidechainWithdrewEntries,
    polygonDepositedEntries,
    polygonWithdrewEntries,
  }); */
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
  // formatToken,
  // formatLand,
  getStoreEntries,
  getAllWithdrawsDeposits,
};