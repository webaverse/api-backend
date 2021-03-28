const {getDynamoItem, putDynamoItem} = require('./aws.js');
const {getChainNft, getChainAccount} = require('./tokens.js');
const {accountKeys} = require('./constants.js');

const ids = {
  lastCachedBlock: 'lastCachedBlock',
};
const tableNames = {
  mainnetsidechainAccount: 'sidechain-cache-account',
  mainnetsidechainNft: 'sidechain-cache-nft',
};

async function initNftCache({addresses, wsContracts, webSockets}) {
  const webSocketWeb3 = webSockets.mainnetsidechain;
  const webSocketContract = wsContracts.mainnetsidechain;

  const currentBlockNumber = await webSocketWeb3.eth.getBlockNumber();
  const lastBlockNumber = (await getDynamoItem(ids.lastCachedBlock, tableNames.mainnetsidechainNft)).number || 0;

  // Catch up on missing blocks.
  if (currentBlockNumber !== lastBlockNumber) {
    const events = await getPastEvents({
      contract: webSocketContract,
      contractName: 'NFT',
      lastBlockNumber,
    });
    if (events.length > 0) {
      await processEventsNft({addresses, contract: webSocketContract, events, currentBlockNumber});
    }
  }

  // Watch for new events.
  await new Promise((accept, reject) => {
    wsContracts.mainnet.NFT.events.allEvents({fromBlock: 'latest'}, async (error, event) => {
      console.debug('EVENT:', event);
      if (error) {
        console.log('Error getting event: ' + error);
        reject(error);
      } else {
        await processEventNft({
          addresses,
          contract: webSocketContract,
          event,
        });
        accept();
      }
    });
  });
}
async function initAccountCache({addresses, wsContracts, webSockets}) {
  const webSocketWeb3 = webSockets.mainnetsidechain;
  const webSocketContract = wsContracts.mainnetsidechain;

  const currentBlockNumber = await webSocketWeb3.eth.getBlockNumber();
  const lastBlockNumber = (await getDynamoItem(ids.lastCachedBlock, tableNames.mainnetsidechainAccount)).number || 0;

  console.log('initAccountCache 1', {
    currentBlockNumber,
    lastBlockNumber,
    // webSocketContract,
  });

  // Catch up on missing blocks.
  if (currentBlockNumber !== lastBlockNumber) {
    console.log('initAccountCache 2');
    
    const events = await getPastEvents({
      contract: webSocketContract,
      contractName: 'Account',
      lastBlockNumber,
    });
    if (events.length > 0) {
      console.log('initAccountCache 3', events);
      await processEventsAccount({
        addresses,
        contract: webSocketContract,
        events,
        currentBlockNumber,
      });
    }
  }

  /* // Watch for new events.
  await new Promise((accept, reject) => {
    wsContracts.mainnet.Account.events.allEvents({fromBlock: 'latest'}, async (error, event) => {
      console.debug('EVENT:', event);
      if (error) {
        console.log('Error getting event: ' + error);
        reject(error);
      } else {
        await processEventAccount({addresses, contract: webSocketContract, event});
        accept();
      }
    });
  }); */
}
async function initCaches({addresses, wsContracts, webSockets}) {
  await Promise.all([
    initNftCache({addresses, wsContracts, webSockets}),
    initAccountCache({addresses, wsContracts, webSockets}),
  ]);
}

async function processEventNft({addresses, contract, event}) {
  const {tokenId} = event.returnValues;

  if (tokenId) {
    try {
      const token = await getChainNft({
        addresses,
        contract,
        tokenId,
      });

      if (token.properties.hash) {
        await putDynamoItem(token.id, token, tableNames.mainnetsidechainNft);
      }
    } catch (e) {
      console.error(e);
    }
  }

  const {blockNumber} = event;
  await putDynamoItem(ids.lastCachedBlock, {number: blockNumber}, tableNames.mainnetsidechainNft);
}

async function processEventsNft({addresses, contract, events, currentBlockNumber}) {
  const responses = {};

  // Get tokenId from each event and add it to the URI table.
  for (const event of events) {
    const {tokenId} = event.returnValues;

    if (tokenId) {
      try {
        const res = getDynamoItem(tokenId, tableNames.mainnetsidechainNft);
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
      await putDynamoItem(entry[0], token, tableNames.mainnetsidechainNft);
    }
  }));
  
  await putDynamoItem(ids.lastCachedBlock, {number: currentBlockNumber}, tableNames.mainnetsidechainNft);
}

async function processEventAccount({addresses, contract, event}) {
  const {tokenId} = event.returnValues;

  if (tokenId) {
    try {
      const token = await getChainAccount({
        addresses,
        // contract,
        // tokenId,
      });

      if (token.properties.hash) {
        await putDynamoItem(token.id, token, tableNames.mainnetsidechainAccount);
      }
    } catch (e) {
      console.error(e);
    }
  }

  const {blockNumber} = event;
  await putDynamoItem(ids.lastCachedBlock, {number: blockNumber}, tableNames.mainnetsidechainAccount);
}
async function processEventsAccount({addresses, contract, events, currentBlockNumber}) {
  const responses = {};

  // Get tokenId from each event and add it to the URI table.
  for (const event of events) {
    const {owner} = event.returnValues;

    if (owner) {
      try {
        const res = getDynamoItem(owner, tableNames.mainnetsidechainAccount);
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
  
  await putDynamoItem(ids.lastCachedBlock, {number: currentBlockNumber}, tableNames.mainnetsidechainAccount);
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