const crypto = require('crypto');
const bip39 = require('bip39');
const flowJs = require('./flow.js');
const flow = {
  sdk: require('@onflow/sdk'),
  types: require('@onflow/types'),
  crypto: flowJs.crypto,
  signingFunction: flowJs.signingFunction,
};
const flowConstants = require('./flow-constants.js');
const config = require('./config.json');

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
const _isSealed = tx => tx.status >= 4;
const _waitForTx = async txid => {
  for (;;) {
    const response2 = await flow.sdk.send(await flow.sdk.pipe(await flow.sdk.build([
      flow.sdk.getTransactionStatus(txid),
    ]), [
      flow.sdk.resolve([
        flow.sdk.resolveParams,
      ]),
    ]), { node: flowConstants.host });
    // console.log('got response 2', response2);
    if (_isSealed(response2.transaction)) {
      return response2;
    } else {
      await new Promise((accept, reject) => {
        setTimeout(accept, 500);
      });
    }
  }
};

const createAccount = async (userKeys, contractSource) => {
  for (;;) {
    const acctResponse = await flow.sdk.send(await flow.sdk.pipe(await flow.sdk.build([
      flow.sdk.getAccount(config.address),
    ]), [
      flow.sdk.resolve([
        flow.sdk.resolveParams,
      ]),
    ]), { node: flowConstants.host });
    console.log('create account', JSON.stringify(acctResponse, null, 2));
    const seqNum = acctResponse.account.keys[0].sequenceNumber;

    const signingFunction = flow.signingFunction.signingFunction(config.privateKey);

    const response = await flow.sdk.send(await flow.sdk.pipe(await flow.sdk.build([
      flow.sdk.authorizations([flow.sdk.authorization(config.address, signingFunction, 0)]),
      flow.sdk.payer(flow.sdk.authorization(config.address, signingFunction, 0)),
      flow.sdk.proposer(flow.sdk.authorization(config.address, signingFunction, 0, seqNum)),
      flow.sdk.limit(100),
      flow.sdk.transaction`
        transaction(publicKeys: [String]${contractSource ? `, code: String` : ''}) {
          prepare(signer: AuthAccount) {
            let acct = AuthAccount(payer: signer)
            for key in publicKeys {
              acct.addPublicKey(key.decodeHex())
            }
            ${contractSource ? `acct.setCode(code.decodeHex())` : ''}
          }
        }
      `,
      flow.sdk.args([
        flow.sdk.arg([userKeys.flowKey], flow.types.Array(flow.types.String)),
      ].concat(contractSource ? [flow.sdk.arg(uint8Array2hex(new TextEncoder().encode(contractSource)), flow.types.String)] : [])),
    ]), [
      flow.sdk.resolve([
        flow.sdk.resolveArguments,
        flow.sdk.resolveParams,
        flow.sdk.resolveAccounts,
        flow.sdk.resolveRefBlockId({ node: flowConstants.host }),
        flow.sdk.resolveSignatures,
      ]),
    ]), { node: flowConstants.host });

    const response2 = await _waitForTx(response.transactionId);
    console.log('got create account response', response2);
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
    auth = true,
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
    ]), { node: flowConstants.host });
    let keyIndex = acctResponse.account.keys.findIndex(key => key.publicKey === publicKey);
    if (keyIndex === -1) {
      keyIndex = 0;
    }
    const seqNum = acctResponse.account.keys[keyIndex].sequenceNumber;

    const signingFunction = flow.signingFunction.signingFunction(privateKey);

    if (auth) {
      chain.push(flow.sdk.authorizations([flow.sdk.authorization(address, signingFunction, keyIndex)]))
    }
    chain.push(flow.sdk.proposer(flow.sdk.authorization(address, signingFunction, keyIndex, seqNum)));
  }
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
      flow.sdk.resolveRefBlockId({ node: flowConstants.host }),
      flow.sdk.resolveSignatures,
    ]),
  ]), { node: flowConstants.host });
  
  if (transaction) {
    if (wait) {
      response = await _waitForTx(response.transactionId);
    }
  } /* else if (script) {
    response = response.encodedData.value;
  } */
  
  return response;
};

module.exports = {
  makeMnemonic,
  genKeys,
  createAccount,
  runTransaction,
};