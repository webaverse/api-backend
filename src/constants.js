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
const burnAddress = "0x000000000000000000000000000000000000dEaD";

const unlockableKey = 'unlockable';

let config = require('fs').existsSync('../config.json') ? require('../config.json') : require('../config.default.json');

const MAINNET_MNEMONIC = process.env.MAINNET_MNEMONIC || config.MAINNET_MNEMONIC;
const TESTNET_MNEMONIC = process.env.TESTNET_MNEMONIC || config.TESTNET_MNEMONIC;
const POLYGON_MNEMONIC = process.env.POLYGON_MNEMONIC || config.POLYGON_MNEMONIC;
const TESTNET_POLYGON_MNEMONIC = process.env.TESTNET_POLYGON_MNEMONIC || config.TESTNET_POLYGON_MNEMONIC;
const INFURA_PROJECT_ID = process.env.INFURA_PROJECT_ID || config.INFURA_PROJECT_ID;
const ENCRYPTION_MNEMONIC = process.env.ENCRYPTION_MNEMONIC || config.ENCRYPTION_MNEMONIC;
const POLYGON_VIGIL_KEY = process.env.POLYGON_VIGIL_KEY || config.POLYGON_VIGIL_KEY;
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || config.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || config.GITHUB_CLIENT_SECRET;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || config.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || config.DISCORD_CLIENT_SECRET;

const defaultAvatarPreview = process.env.defaultAvatarPreview || config.defaultAvatarPreview;
const REDIS_HOST = process.env.REDIS_HOST || config.REDIS_HOST;
const REDIS_PORT = process.env.REDIS_PORT || config.REDIS_PORT;

const HTTP_PORT = parseInt(process.env.HTTP_PORT || config.HTTP_PORT, 10) || 80;
const HTTPS_PORT = parseInt(process.env.HTTPS_PORT || config.HTTPS_PORT, 10) || 443;
const PUBLIC_IP_ADDRESS = process.env.PUBLIC_IP_ADDRESS || config.PUBLIC_IP_ADDRESS;
const PRIVATE_IP_ADDRESS = process.env.PRIVATE_IP_ADDRESS || config.PRIVATE_IP_ADDRESS;
const storageHost = process.env.storageHost || config.storageHost;
const ETHEREUM_HOST = process.env.ETHEREUM_HOST || config.ETHEREUM_HOST;
const defaultTokenDescription = process.env.defaultTokenDescription || config.defaultTokenDescription || "";
const AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || config.AUTH_TOKEN_SECRET || "";
const AUTH_SECRET_KEY = process.env.AUTH_SECRET_KEY || config.AUTH_SECRET_KEY || "";

const mintingFee = process.env.mintingFee || config.mintingFee || 10;

module.exports = {
  AUTH_SECRET_KEY,
  AUTH_TOKEN_SECRET,
  PUBLIC_IP_ADDRESS,
  PRIVATE_IP_ADDRESS,
  HTTP_PORT,
  HTTPS_PORT,
  REDIS_HOST,
  REDIS_PORT,
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  MAINNET_MNEMONIC,
  TESTNET_MNEMONIC,
  POLYGON_MNEMONIC,
  TESTNET_POLYGON_MNEMONIC,
  INFURA_PROJECT_ID,
  ENCRYPTION_MNEMONIC,
  POLYGON_VIGIL_KEY,
  defaultTokenDescription,
  burnAddress,
  mintingFee,
  ETHEREUM_HOST,
  storageHost,
  defaultAvatarPreview,
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