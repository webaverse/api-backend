const {ddbd, getDynamoItem, putDynamoItem} = require('./aws.js');
const {getChainNft, getChainAccount} = require('./tokens.js');
const {ids, tableNames, accountKeys} = require('./constants.js');

async function initNftCache({addresses, wsContracts, webSockets, chainName}) {
  const webSocketWeb3 = webSockets[chainName];
  const webSocketContract = wsContracts[chainName];

  const currentBlockNumber = await webSocketWeb3.eth.getBlockNumber();
  const lastBlockNumber = (await getDynamoItem(
    ids.lastCachedBlockNft,
    tableNames[chainName + 'Nft']
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
        chainName,
      });
    }
  }

  // Watch for new events.
  wsContracts[chainName].NFT.events.allEvents({fromBlock: 'latest'}, async (error, event) => {
    console.debug('nft event', event);
    if (error) {
      console.log('Error getting event: ' + error);
      reject(error);
    } else {
      await processEventNft({
        addresses,
        contract: webSocketContract,
        event,
        chainName,
      });
    }
  });
}
async function initAccountCache({addresses, wsContracts, webSockets, chainName}) {
  const webSocketWeb3 = webSockets[chainName];
  const webSocketContract = wsContracts[chainName];

  const currentBlockNumber = await webSocketWeb3.eth.getBlockNumber();
  const lastBlockNumber = (await getDynamoItem(
    ids.lastCachedBlockAccount,
    tableNames[chainName + 'Account']
  )).number || 0;

  /* console.log('initAccountCache 1', {
    currentBlockNumber,
    lastBlockNumber,
    // webSocketContract,
  }); */

  // Catch up on missing blocks.
  if (currentBlockNumber !== lastBlockNumber) {
    // console.log('initAccountCache 2');
    
    const events = await getPastEvents({
      contract: webSocketContract,
      contractName: 'Account',
      lastBlockNumber,
    });
    // console.log('initAccountCache 3', events.length);
    if (events.length > 0) {
      await processEventsAccount({
        addresses,
        contract: webSocketContract,
        events,
        currentBlockNumber,
        chainName,
      });
    }
  }

  // Watch for new events.
  await new Promise((accept, reject) => {
    wsContracts[chainName].Account.events.allEvents({fromBlock: 'latest'}, async (error, event) => {
      console.debug('account event', event);
      if (error) {
        console.log('Error getting event: ' + error);
        reject(error);
      } else {
        await processEventAccount({
          addresses,
          contract: webSocketContract,
          event,
          chainName,
        });
        accept();
      }
    });
  });
}
async function initCaches({addresses, wsContracts, webSockets}) {
  const _logCache = async (name, p) => {
    console.log('started init cache', name);
    try {
      return await p;
    } catch(err) {
      console.warn('errored init cache', err);
      throw err;
    }
    console.log('finished init cache', name);
  };
  await Promise.all([
    'mainnet',
    'mainnetsidechain',
    'testnet',
    'testnetsidechain',
    'polygon',
    'testnetpolygon',
  ].map(chainName => {
    return Promise.all([
      _logCache(chainName + ' NFT', initNftCache({addresses, wsContracts, webSockets, chainName})),
      _logCache(chainName + ' Account', initAccountCache({addresses, wsContracts, webSockets, chainName})),
    ]);
  }));
}

async function processEventNft({addresses, contract, event, isMainnet}) {
  let {tokenId, hash, key, value} = event.returnValues;

  if (tokenId) {
    try {
      const token = await getChainNft({
        addresses,
        contract,
        tokenId,
      });

      if (token.properties.hash) {
        tokenId = parseInt(tokenId, 10);

        await putDynamoItem(tokenId, token, isMainnet ? tableNames.mainnetNft : tableNames.mainnetsidechainNft);
      }
    } catch (e) {
      console.error(e);
    }
  } else if (hash) {
    // console.log('updating hash 1', hash);
    
    const params = {
      FilterExpression: "#hash = :hash",
      ExpressionAttributeNames: {
        "#hash": "hash",
      },
      ExpressionAttributeValues: {
        ':hash': hash,
      },
      TableName: isMainnet ? tableNames.mainnetNft : tableNames.mainnetsidechainNft,
      IndexName: 'hash-index',
    };
    const o = await ddbd.scan(params).promise();
    // console.log('got o', o);
    let tokens = o.Items;
    // console.log('updating hash 2', tokens);
    for (const token of tokens) {
      token[key] = value;
    }
    
    // console.log('updating hash 3', tokens);

    await Promise.all(tokens.map(token => {
      return putDynamoItem(parseInt(token.id, 10), token, isMainnet ? tableNames.mainnetNft : tableNames.mainnetsidechainNft);
    }));
    
    // console.log('updating hash 4');
  }

  const {blockNumber} = event;
  await putDynamoItem(ids.lastCachedBlockNft, {number: blockNumber}, isMainnet ? tableNames.mainnetNft : tableNames.mainnetsidechainNft);
}

async function processEventsNft({addresses, contract, events, currentBlockNumber, chainName}) {
  const responses = {};

  // Get tokenId from each event and add it to the URI table.
  for (const event of events) {
    let {tokenId} = event.returnValues;
    tokenId = parseInt(tokenId, 10);

    if (!isNaN(tokenId)) {
      try {
        const res = getDynamoItem(tokenId, tableNames[chainName + 'Nft']);
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
      chainName,
    });

    // Cache each token.
    if (token.properties.hash) {
      const tokenId = parseInt(entry[0], 10);
      await putDynamoItem(tokenId, token, tableNames[chainName + 'Nft']);
    }
  }));
  
  await putDynamoItem(ids.lastCachedBlockNft, {number: currentBlockNumber}, tableNames.mainnetsidechainNft);
}

async function processEventAccount({addresses, contract, event, chainName}) {
  // console.log('got account event', event);
  const {owner} = event.returnValues;

  if (owner) {
    try {
      const account = await getChainAccount({
        addresses,
        contract,
        address: owner,
      });
      
      // console.log('load account into cache', owner, account);

      // if (token.properties.hash) {
        await putDynamoItem(owner, account, tableNames[chainName + 'Account']);
      // }
    } catch (e) {
      console.error(e);
    }
  }

  const {blockNumber} = event;
  await putDynamoItem(ids.lastCachedBlockAccount, {number: blockNumber}, tableNames[chainName + 'Account']);
}
async function processEventsAccount({addresses, contract, events, currentBlockNumber, chainName}) {
  const responses = {};

  // Get tokenId from each event and add it to the URI table.
  for (const event of events) {
    let {owner} = event.returnValues;
    owner = owner.toLowerCase();

    if (owner) {
      try {
        const res = getDynamoItem(owner, tableNames[chainName + 'Account']);
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
    await putDynamoItem(entry[0], account, tableNames[chainName + 'Account']);
  }));
  
  await putDynamoItem(ids.lastCachedBlockAccount, {number: currentBlockNumber}, tableNames[chainName + 'Account']);
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