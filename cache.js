const {getDynamoItem, putDynamoItem} = require('./aws.js');
const {getChainNft, getChainAccount} = require('./tokens.js');
const {ids, tableNames, accountKeys} = require('./constants.js');

async function initNftCache({addresses, wsContracts, webSockets, isMainnet}) {
  const webSocketWeb3 = isMainnet ? webSockets.mainnet : webSockets.mainnetsidechain;
  const webSocketContract = isMainnet ? wsContracts.mainnet : wsContracts.mainnetsidechain;

  const currentBlockNumber = await webSocketWeb3.eth.getBlockNumber();
  const lastBlockNumber = (await getDynamoItem(
    ids.lastCachedBlockNft,
    isMainnet ? tableNames.mainnetNft : tableNames.mainnetsidechainNft
  )).number || 0;

  // Catch up on missing blocks.
  if (currentBlockNumber !== lastBlockNumber) {
    const events = await getPastEvents({
      contract: webSocketContract,
      contractName: 'NFT',
      lastBlockNumber,
    });
    if (events.length > 0) {
      await processEventsNft({
        addresses,
        contract: webSocketContract,
        events,
        currentBlockNumber,
        isMainnet,
      });
    }
  }

  // Watch for new events.
  await new Promise((accept, reject) => {
    (isMainnet ? wsContracts.mainnet : wsContracts.mainnetsidechain).NFT.events.allEvents({fromBlock: 'latest'}, async (error, event) => {
      console.debug('nft event', event);
      if (error) {
        console.log('Error getting event: ' + error);
        reject(error);
      } else {
        await processEventNft({
          addresses,
          contract: webSocketContract,
          event,
          isMainnet,
        });
        accept();
      }
    });
  });
}
async function initAccountCache({addresses, wsContracts, webSockets, isMainnet}) {
  const webSocketWeb3 = isMainnet ? webSockets.mainnet : webSockets.mainnetsidechain;
  const webSocketContract = isMainnet ? wsContracts.mainnet : wsContracts.mainnetsidechain;

  const currentBlockNumber = await webSocketWeb3.eth.getBlockNumber();
  const lastBlockNumber = (await getDynamoItem(
    ids.lastCachedBlockAccount,
    isMainnet ? tableNames.mainnetAccount : tableNames.mainnetsidechainAccount
  )).number || 0;

  /* console.log('initAccountCache 1', {
    currentBlockNumber,
    lastBlockNumber,
    // webSocketContract,
  }); */

  // Catch up on missing blocks.
  if (currentBlockNumber !== lastBlockNumber) {
    console.log('initAccountCache 2');
    
    const events = await getPastEvents({
      contract: webSocketContract,
      contractName: 'Account',
      lastBlockNumber,
    });
    console.log('initAccountCache 3', events.length);
    if (events.length > 0) {
      await processEventsAccount({
        addresses,
        contract: webSocketContract,
        events,
        currentBlockNumber,
        isMainnet,
      });
    }
  }

  // Watch for new events.
  await new Promise((accept, reject) => {
    (isMainnet ? wsContracts.mainnet : wsContracts.mainnetsidechain).Account.events.allEvents({fromBlock: 'latest'}, async (error, event) => {
      console.debug('account event', event);
      if (error) {
        console.log('Error getting event: ' + error);
        reject(error);
      } else {
        await processEventAccount({
          addresses,
          contract: webSocketContract,
          event,
          isMainnet,
        });
        accept();
      }
    });
  });
}
async function initCaches({addresses, wsContracts, webSockets}) {
  await Promise.all([
    initNftCache({addresses, wsContracts, webSockets, isMainnet: false}),
    initAccountCache({addresses, wsContracts, webSockets, isMainnet: false}),
    initNftCache({addresses, wsContracts, webSockets, isMainnet: true}),
    initAccountCache({addresses, wsContracts, webSockets, isMainnet: true}),
  ]);
}

async function processEventNft({addresses, contract, event, isMainnet}) {
  const {tokenId} = event.returnValues;

  if (tokenId) {
    try {
      const token = await getChainNft({
        addresses,
        contract,
        tokenId,
      });

      if (token.properties.hash) {
        console.log('loaded token with id', {id: token.id});
        await putDynamoItem(token.id, token, isMainnet ? tableNames.mainnetNft : tableNames.mainnetsidechainNft);
      }
    } catch (e) {
      console.error(e);
    }
  }

  const {blockNumber} = event;
  await putDynamoItem(ids.lastCachedBlockNft, {number: blockNumber}, isMainnet ? tableNames.mainnetNft : tableNames.mainnetsidechainNft);
}

async function processEventsNft({addresses, contract, events, currentBlockNumber, isMainnet}) {
  const responses = {};

  // Get tokenId from each event and add it to the URI table.
  for (const event of events) {
    let {tokenId} = event.returnValues;
    tokenId = parseInt(tokenId, 10);

    if (!isNaN(tokenId)) {
      try {
        const res = getDynamoItem(tokenId, isMainnet ? tableNames.mainnetNft : tableNames.mainnetsidechainNft);
        if (res) {
          responses[tokenId] = res;
        }
      } catch (e) {
        console.error(e);
      }
    }
  }

  // Map each response to a token.
  await Promise.all(Object.entries(responses).map(async entry => {
    const token = await getChainNft({
      addresses,
      contract,
      tokenId: entry[0],
    });

    // Cache each token.
    if (token.properties.hash) {
      await putDynamoItem(parseInt(entry[0], 10), token, isMainnet ? tableNames.mainnetNft : tableNames.mainnetsidechainNft);
    }
  }));
  
  await putDynamoItem(ids.lastCachedBlockNft, {number: currentBlockNumber}, tableNames.mainnetsidechainNft);
}

async function processEventAccount({addresses, contract, event, isMainnet}) {
  const {tokenId} = event.returnValues;

  if (tokenId) {
    try {
      const token = await getChainAccount({
        addresses,
        // contract,
        // tokenId,
      });

      if (token.properties.hash) {
        await putDynamoItem(token.id, token, isMainnet ? tableNames.mainnetAccount : tableNames.mainnetsidechainAccount);
      }
    } catch (e) {
      console.error(e);
    }
  }

  const {blockNumber} = event;
  await putDynamoItem(ids.lastCachedBlockAccount, {number: blockNumber}, isMainnet ? tableNames.mainnetAccount : tableNames.mainnetsidechainAccount);
}
async function processEventsAccount({addresses, contract, events, currentBlockNumber, isMainnet}) {
  const responses = {};

  // Get tokenId from each event and add it to the URI table.
  for (const event of events) {
    let {owner} = event.returnValues;
    owner = owner.toLowerCase();

    if (owner) {
      try {
        const res = getDynamoItem(owner, isMainnet ? tableNames.mainnetAccount : tableNames.mainnetsidechainAccount);
        if (res) {
          responses[owner] = res;
        }
      } catch (e) {
        console.error(e);
      }
    }
  }

  // Map each response to a token.
  await Promise.all(Object.entries(responses).map(async entry => {
    const account = await getChainAccount({
      addresses,
      contract,
      address: entry[0],
    });

    // Cache each token.
    // XXX possible race condition with different versions of tokens + timing?
    await putDynamoItem(entry[0], account, tableNames.mainnetsidechainAccount);
  }));
  
  await putDynamoItem(ids.lastCachedBlockAccount, {number: currentBlockNumber}, isMainnet ? tableNames.mainnetAccount : tableNames.mainnetsidechainAccount);
}

async function getPastEvents({
  contract,
  contractName,
  fromBlock = 0,
  toBlock = 'latest',
} = {}) {
  try {
    return await contract[contractName].getPastEvents(
      'allEvents',
      {fromBlock, toBlock}
    );
  }

  catch ( e ) {
    console.error(e);
    return [];
  }
}

module.exports = {
  initCaches,
};