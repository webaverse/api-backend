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
  lastCachedBlock: 'lastCachedBlock',
};
const tableNames = {
  mainnetsidechainAccount: 'sidechain-cache-account',
  mainnetsidechainNft: 'sidechain-cache-nft',
};
module.exports = {
  accountKeys,
  ids,
  tableNames,
};