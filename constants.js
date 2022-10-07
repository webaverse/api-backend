const MAX_SIZE = 50 * 1024 * 1024;
const accountKeys = [
  'name',
  'avatarId',
  'avatarName',
  'avatarExt',
  'avatarPreview',
  'loadout',
  'homeSpaceId',
  'homeSpaceName',
  'homeSpaceExt',
  'homeSpacePreview',
  'ftu',
  // 'mainnetAddress',
  'addressProofs',
];
const ids = {
  lastCachedBlockAccount: 'lastCachedBlock',
  lastCachedBlockNft: -1,
};
const tableNames = {
  mainnetAccount: 'mainnet-cache-account',
  mainnetNft: 'mainnet-cache-nft',
  mainnetsidechainAccount: 'sidechain-cache-account',
  mainnetsidechainNft: 'sidechain-cache-nft',
  testnetAccount: 'testnet-cache-account',
  testnetNft: 'testnet-cache-nft',
  testnetsidechainAccount: 'testnetsidechain-cache-account',
  testnetsidechainNft: 'testnetsidechain-cache-nft',
  polygonAccount: 'polygon-cache-account',
  polygonNft: 'polygon-cache-nft',
  testnetpolygonAccount: 'testnetpolygon-cache-account',
  testnetpolygonNft: 'testnetpolygon-cache-nft',
  WebaverseERC721: "WebaverseERC721-cache-tokenids",
};
const redisPrefixes = (() => {
  const result = {};
  for (const k in tableNames) {
    result[k] = tableNames[k].replace(/\-/g, '');
  }
  return result;
})();
const nftIndexName = 'nftIdx';
const polygonVigilKey = `1bdde9289621d9d420488a9804254f4a958e128b`;
const polygonAlchemyKey = 'bN2G8nP-vDFAnRXksfpd7I7g5f9c0GqD' // will be process.env.polygonAlchemyKey
const ethereumHost = 'ethereum.exokit.org';
const storageHost = 'https://ipfs.exokit.org';
const mainnetSignatureMessage = `Connecting mainnet address.`;
const cacheHostUrl = 'cache.webaverse.com';
module.exports = {
  MAX_SIZE,
  accountKeys,
  ids,
  tableNames,
  redisPrefixes,
  nftIndexName,
  polygonVigilKey,
  polygonAlchemyKey,
  ethereumHost,
  storageHost,
  mainnetSignatureMessage,
  cacheHostUrl,
};