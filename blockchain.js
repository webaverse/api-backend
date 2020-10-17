const crypto = require('crypto');
const bip39 = require('bip39');
const fetch = require('node-fetch');
const flowJs = require('./flow.js');
const flow = {
  sdk: require('@onflow/sdk'),
  types: require('@onflow/types'),
  crypto: flowJs.crypto,
  signingFunction: flowJs.signingFunction,
};
const flowConstants = require('./flow-constants.js')
const config = require('./config.json');

let FungibleToken, NonFungibleToken, WebaverseToken, WebaverseNFT, WebaverseAccount, host;
let isLoaded = false;
flowConstants.load()
  .then(o => {
    FungibleToken = o.FungibleToken;
    NonFungibleToken = o.NonFungibleToken;
    WebaverseToken = o.WebaverseToken;
    WebaverseNFT = o.WebaverseNFT;
    WebaverseAccount = o.WebaverseAccount;
    host = o.host;
    isLoaded = true;
  });

const getIsLoaded = () => isLoaded;
const haveContracts = () => WebaverseToken && WebaverseNFT && WebaverseAccount;

const contractSourceCache = {};
async function getContractSource(p) {
  let contractSource = contractSourceCache[p];
  if (!contractSource) {
    const res = await fetch('https://contracts.webaverse.com/flow/' + p);
    contractSource = await res.text();
    contractSource = await resolveContractSource(contractSource);
    contractSourceCache[p] = contractSource;
  }
  return contractSource;
}

async function resolveContractSource(contractSource) {
  const {FungibleToken, NonFungibleToken, WebaverseToken, WebaverseNFT, WebaverseAccount} = await flowConstants.load();
  return contractSource
    .replace(/NONFUNGIBLETOKENADDRESS/g, NonFungibleToken)
    .replace(/FUNGIBLETOKENADDRESS/g, FungibleToken)
    .replace(/WEBAVERSETOKENADDRESS/g, WebaverseToken)
    .replace(/WEBAVERSENFTADDRESS/g, WebaverseNFT)
    .replace(/WEBAVERSEACCOUNTADDRESS/g, WebaverseAccount);
}

const makeMnemonic = () => bip39.entropyToMnemonic(crypto.randomBytes(32));
const genKeys = async mnemonic => {
  const seed = await bip39.mnemonicToSeed(mnemonic);
  return flow.crypto.genKeys({
    entropy: seed.toString('hex'),
    entropyEnc: 'hex',
  });
};
function uint8Array2hex(uint8Array) {
  return Array.prototype.map.call(uint8Array, x => ('00' + x.toString(16)).slice(-2)).join('');
}
const _isPending = tx => tx.status >= 1;
const _isFinalized = tx => tx.status >= 2;
const _isExecuted = tx => tx.status >= 3;
const _isSealed = tx => tx.status >= 4;
const _waitForTx = async txid => {
  for (;;) {
    const response2 = await flow.sdk.send(await flow.sdk.pipe(await flow.sdk.build([
      flow.sdk.getTransactionStatus(txid),
    ]), [
      flow.sdk.resolve([
        flow.sdk.resolveParams,
      ]),
    ]), { node: host });
    if (_isSealed(response2.transaction)) {
      return response2;
    } else {
      await new Promise((accept, reject) => {
        setTimeout(accept, 500);
      });
    }
  }
};

const createAccount = async (userKeys, {bake = false} = {}) => {
  const contractSource = await getContractSource('bakeUserAccount.cdc');
  const match = contractSource.match(/([\s\S]*)(transaction[\s\S]*)$/);
  const header = match[1];
  const body = match[2];
  const ls = body.split('\n');
  const beginPrepareIndex = ls.findIndex(l => /begin prepare/.test(l));
  const endPrepareIndex = ls.findIndex(l => /end prepare/.test(l));
  const prepareBody = ls.slice(beginPrepareIndex + 1, endPrepareIndex).join('\n');
  if (bake && !haveContracts()) {
    bake = false;
  }

  console.log('create account', {bake});

  for (;;) {
    const acctResponse = await flow.sdk.send(await flow.sdk.pipe(await flow.sdk.build([
      flow.sdk.getAccount(config.address),
    ]), [
      flow.sdk.resolve([
        flow.sdk.resolveParams,
      ]),
    ]), { node: host });
    console.log('try create account', acctResponse);
    const seqNum = acctResponse.account.keys[0].sequenceNumber;

    const signingFunction = flow.signingFunction.signingFunction(config.privateKey);

    const transactionSrc = `
      ${bake ? header : ''}
      transaction(publicKeys: [String]) {
        prepare(signer: AuthAccount) {
          let account = AuthAccount(payer: signer)
          for key in publicKeys {
            account.addPublicKey(key.decodeHex())
          }
          ${bake ? prepareBody : ''}
        }
      }
    `;
    const response = await flow.sdk.send(await flow.sdk.pipe(await flow.sdk.build([
      flow.sdk.authorizations([flow.sdk.authorization(config.address, signingFunction, 0)]),
      flow.sdk.payer(flow.sdk.authorization(config.address, signingFunction, 0)),
      flow.sdk.proposer(flow.sdk.authorization(config.address, signingFunction, 0, seqNum)),
      flow.sdk.limit(100),
      flow.sdk.transaction(transactionSrc),
      flow.sdk.args([
        flow.sdk.arg([userKeys.flowKey], flow.types.Array(flow.types.String)),
      ]),
    ]), [
      flow.sdk.resolve([
        flow.sdk.resolveArguments,
        flow.sdk.resolveParams,
        flow.sdk.resolveAccounts,
        flow.sdk.resolveRefBlockId({ node: host }),
        flow.sdk.resolveSignatures,
      ]),
    ]), { node: host });

    const response2 = await _waitForTx(response.transactionId);
    console.log('got create account response', response2, transactionSrc);
    if (response2.transaction.statusCode === 0) {
      const address = response2.transaction.events[0].payload.value.fields[0].value.value.slice(2);
      // console.log('got response 6', userKeys.address);
      return address;
    } else {
      console.log('retrying account creation');
      continue;
    }
  }
};

const signingFunction2 = flow.signingFunction.signingFunction(config.privateKey);
const _getType = type => {
  if (Array.isArray(type)) {
    return [_getType(type[0])];
  } else {
    return flow.types[type];
  }
};
const runTransaction = async spec => {
  let {
    address,
    privateKey,
    publicKey,
    mnemonic,

    limit,
    transaction,
    script,
    args = [],
    wait = false,
  } = spec;
  args = args.map(({value, type}) => {
    return flow.sdk.arg(value, _getType(type));
  });
  
  if (mnemonic) {
    const userKeys = await genKeys(mnemonic);
    privateKey = userKeys.privateKey;
    publicKey = userKeys.publicKey;
  }
  
  const chain = [];
  if (address) {
    const acctResponse = await flow.sdk.send(await flow.sdk.pipe(await flow.sdk.build([
      flow.sdk.getAccount(address),
    ]), [
      flow.sdk.resolve([
        flow.sdk.resolveParams,
      ]),
    ]), { node: host });
    let keyIndex = acctResponse.account.keys.findIndex(key => key.publicKey === publicKey);
    if (keyIndex === -1) {
      keyIndex = 0;
    }
    const seqNum = acctResponse.account.keys[keyIndex].sequenceNumber;

    const signingFunction = flow.signingFunction.signingFunction(privateKey);

    chain.push(flow.sdk.authorizations([flow.sdk.authorization(address, signingFunction, keyIndex)]))
    chain.push(flow.sdk.proposer(flow.sdk.authorization(address, signingFunction, keyIndex, seqNum)));
  } /* else {
    const acctResponse = await flow.sdk.send(await flow.sdk.pipe(await flow.sdk.build([
      flow.sdk.getAccount(config.address),
    ]), [
      flow.sdk.resolve([
        flow.sdk.resolveParams,
      ]),
    ]), { node: host });
    const keyIndex = 0;
    const seqNum = acctResponse.account.keys[keyIndex].sequenceNumber;

    chain.push(flow.sdk.proposer(flow.sdk.authorization(config.address, signingFunction2, keyIndex, seqNum)));
  } */
  chain.push(flow.sdk.payer(flow.sdk.authorization(config.address, signingFunction2, 0)));
  if (limit) {
    chain.push(flow.sdk.limit(limit));
  }
  if (transaction) {
    chain.push(flow.sdk.transaction(transaction));
  } else if (script) {
    chain.push(flow.sdk.script(script));
  }
  if (args) {
    chain.push(flow.sdk.args(args));
  }
  let response = await flow.sdk.send(await flow.sdk.pipe(await flow.sdk.build(chain), [
    flow.sdk.resolve([
      flow.sdk.resolveArguments,
      flow.sdk.resolveParams,
      flow.sdk.resolveAccounts,
      flow.sdk.resolveRefBlockId({ node: host }),
      flow.sdk.resolveSignatures,
    ]),
  ]), { node: host });
  
  if (transaction) {
    if (wait) {
      response = await _waitForTx(response.transactionId);
    }
  } /* else if (script) {
    response = response.encodedData.value;
  } */
  
  return response;
};

const getLatestBlock = async () => {
  const response = await flow.sdk.send(await flow.sdk.build([
    flow.sdk.getLatestBlock(),
  ]), { node: host });
  return response.block.height;
};
const getEvents = async (eventType, startBlock, endBlock) => {
  const response = await flow.sdk.send(await flow.sdk.build([
    flow.sdk.getEvents(eventType, startBlock, endBlock),
  ]), { node: host });
  return response.events;
};

module.exports = {
  getIsLoaded,
  makeMnemonic,
  genKeys,
  createAccount,
  runTransaction,
  getLatestBlock,
  getEvents,
};