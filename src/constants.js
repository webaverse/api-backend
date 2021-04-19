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
  'addressProofs',
];

const ids = {
  lastCachedBlockAccount: 'lastCachedBlock',
  lastCachedBlockNft: -1,
};

const tableNames = {
  user: 'users',
  defaultCacheTable: 'sidechain-cache',
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
};

const redisPrefixes = (() => {
  const result = {};
  for (const k in tableNames) {
    result[k] = tableNames[k].replace(/\-/g, '');
  }
  return result;
})();

const nftIndexName = 'nftIdx';
const mainnetSignatureMessage = `Connecting mainnet address.`;
const emailRegex = /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/;
const codeTestRegex = /^[0-9]{6}$/;
const discordIdTestRegex = /^[0-9]+$/;
const twitterIdTestRegex = /^@?(\w){1,15}$/;
const zeroAddress = '0x0000000000000000000000000000000000000000';

const unlockableKey = 'unlockable';

let config = require('fs').existsSync('../config.json') ? require('../config.json') : require('../config.default.json');

const mainnetMnemonic = process.env.mainnetMnemonic || config.mainnetMnemonic;
const testnetMnemonic = process.env.testnetMnemonic || config.testnetMnemonic;
const polygonMnemonic = process.env.polygonMnemonic || config.polygonMnemonic;
const testnetpolygonMnemonic = process.env.testnetpolygonMnemonic || config.testnetpolygonMnemonic;
const infuraProjectId = process.env.infuraProjectId || config.infuraProjectId;
const encryptionMnemonic = process.env.encryptionMnemonic || config.encryptionMnemonic;
const polygonVigilKey = process.env.polygonVigilKey || config.polygonVigilKey;
const accessKeyId = process.env.accessKeyId || config.accessKeyId;
const secretAccessKey = process.env.secretAccessKey || config.secretAccessKey;
const githubClientId = process.env.githubClientId || config.githubClientId;
const githubClientSecret = process.env.githubClientSecret || config.githubClientSecret;
const discordClientId = process.env.discordClientId || config.discordClientId;
const discordClientSecret = process.env.discordClientSecret || config.discordClientSecret;
const awsRegion = process.env.awsRegion || config.awsRegion;
const defaultAvatarPreview = process.env.defaultAvatarPreview || config.defaultAvatarPreview;
const cacheHostUrl = process.env.cacheHostUrl || config.cacheHostUrl;
const HTTP_PORT = parseInt(process.env.HTTP_PORT || config.HTTP_PORT, 10) || 80;
const HTTPS_PORT = parseInt(process.env.HTTPS_PORT || config.HTTPS_PORT, 10) || 443;
const publicIp = process.env.publicIp || config.publicIp;
const privateIp = process.env.privateIp || config.privateIp;
const storageHost = process.env.storageHost || config.storageHost;
const ethereumHost = process.env.ethereumHost || config.ethereumHost;

const mintingFee = process.env.mintingFee || config.mintingFee || 10;

module.exports = {
  mintingFee,
  ethereumHost,
  storageHost,
  publicIp,
  privateIp,
  HTTP_PORT,
  HTTPS_PORT,
  cacheHostUrl,
  accessKeyId,
  secretAccessKey,
  githubClientId,
  githubClientSecret,
  discordClientId,
  discordClientSecret,
  awsRegion,
  defaultAvatarPreview,
  mainnetMnemonic,
  testnetMnemonic,
  polygonMnemonic,
  testnetpolygonMnemonic,
  infuraProjectId,
  encryptionMnemonic,
  polygonVigilKey,
  unlockableKey,
  accountKeys,
  config,
  ids,
  tableNames,
  redisPrefixes,
  nftIndexName,
  mainnetSignatureMessage,
  emailRegex,
  codeTestRegex,
  discordIdTestRegex,
  twitterIdTestRegex,
  zeroAddress
};