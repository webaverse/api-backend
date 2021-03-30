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
  'mainnetAddress',
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
  polygonAccount: 'polygon-cache-account',
  polygonNft: 'polygon-cache-nft',
  testnetpolygonAccount: 'testnetpolygon-cache-account',
  testnetpolygonNft: 'testnetpolygon-cache-nft',
};
module.exports = {
  accountKeys,
  ids,
  tableNames,
};