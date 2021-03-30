const {accountKeys} = require('./constants.js');

const storageHost = 'https://ipfs.exokit.org';
const defaultAvatarPreview = `https://preview.exokit.org/[https://raw.githubusercontent.com/avaer/vrm-samples/master/vroid/male.vrm]/preview.png`;

async function formatToken({
  token,
  storeEntries,
  mainnetToken,
  contract,
  addresses,
} = {}) {
  const chainName = 'testnetsidechain';

  const _fetchAccount = async address => {
    const [
      username,
      avatarPreview,
      monetizationPointer,
    ] = await Promise.all([
      (async () => {
        let username = await contract.Account.methods.getMetadata(address, 'name').call();
        if (!username) {
          username = 'Anonymous';
        }
        return username;
      })(),
      (async () => {
        let avatarPreview = await contract.Account.methods.getMetadata(address, 'avatarPreview').call();
        if (!avatarPreview) {
          avatarPreview = defaultAvatarPreview;
        }
        return avatarPreview;
      })(),
      (async () => {
        let monetizationPointer = await contract.Account.methods.getMetadata(address, 'monetizationPointer').call();
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

  let [minter, owner] = await Promise.all([
    _fetchAccount(token.minter),
    _fetchAccount(token.owner),
  ]);

  let isMainnet = false;
  if (mainnetToken && owner.address === addresses[chainName]['NFTProxy'] && mainnetToken.owner !== "0x0000000000000000000000000000000000000000") {
    isMainnet = true;
    owner.address = mainnetToken.owner;
  }

  const id = parseInt(token.id, 10);
  const {name, ext, hash} = token;
  const description = await contract.NFT.methods.getMetadata(hash, 'description').call();
  const storeEntry = storeEntries.find(entry => entry.tokenId === id);
  const buyPrice = storeEntry ? storeEntry.price : null;
  const storeId = storeEntry ? storeEntry.id : null;

  return {
    id,
    name,
    description,
    image: 'https://preview.exokit.org/' + hash + '.' + ext + '/preview.png',
    external_url: 'https://app.webaverse.com?h=' + hash,
    animation_url: `${storageHost}/${hash}/preview.${ext === 'vrm' ? 'glb' : ext}`,
    properties: {
      name,
      hash,
      ext,
    },
    hash,
    minterAddress: minter.address.toLowerCase(),
    minter,
    ownerAddress: owner.address.toLowerCase(),
    owner,
    balance: parseInt(token.balance, 10),
    totalSupply: parseInt(token.totalSupply, 10),
    buyPrice,
    storeId,
    isMainnet,
  };
}

async function getChainNft({
  addresses,
  tokenId,
  contract,
  isFront = false,
  isAll = true,
} = {}) {
  const [
    token,
    storeEntries,
    // hash,
  ] = await Promise.all([
    contract.NFT.methods.tokenByIdFull(tokenId).call(),
    getStoreEntries(contract),
    // contract.NFT.methods.getHash(tokenId).call(),
  ]);

  let mainnetToken;
  if (!isFront && isAll) {
    mainnetToken = await contract.NFT.methods.tokenByIdFull(tokenId).call();
  }
  return await formatToken({addresses, token, storeEntries, mainnetToken, contract});
}

async function getChainAccount({
  addresses,
  address,
  contract,
  isFront = false,
  isAll = true,
} = {}) {
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

async function getStoreEntries(contract) {
  const numStores =
    await contract.Trade.methods.numStores().call();

  const promises = Array(numStores);

  for (let i = 0; i < numStores; i++) {
    promises[i] =
      contract.Trade.methods.getStoreByIndex(i + 1)
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
}

module.exports = {
  getChainNft,
  getChainAccount,
}
