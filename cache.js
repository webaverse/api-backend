const {ddbd, getDynamoItem, putDynamoItem} = require('./aws.js');
const {getChainNft, getChainAccount, getAllWithdrawsDeposits} = require('./tokens.js');
const {ids, tableNames, accountKeys} = require('./constants.js');
const {getBlockchain, getPastEvents} = require('./blockchain.js');

async function initNftCache({chainName}) {
  const {
    web3sockets,
    wsContracts,
  } = await getBlockchain();
  
  const webSocketWeb3 = web3sockets[chainName];
  const contract = wsContracts[chainName];

  // Watch for new events.
  wsContracts[chainName].NFT.events.allEvents({fromBlock: 'latest'}, async (error, event) => {
    console.debug('nft event', event);
    if (error) {
      console.log('Error getting event: ' + error);
      // reject(error);
    } else {
      await processEventNft({
        contract,
        wsContracts,
        event,
        chainName,
      });
    }
  });

  const currentBlockNumber = await webSocketWeb3.eth.getBlockNumber();
  const lastBlockNumber = (await getDynamoItem(
    ids.lastCachedBlockNft,
    tableNames[chainName + 'Nft']
  )).number || 0;

  // Catch up on missing blocks.
  if (currentBlockNumber !== lastBlockNumber) {
    const events = await getPastEvents({
      chainName,
      contractName: 'NFT',
      lastBlockNumber,
    });
    if (events.length > 0) {
      await processEventsNft({
        events,
        currentBlockNumber,
        chainName,
      });
    }
  }
}
async function initAccountCache({chainName}) {
  const {
    web3sockets,
    wsContracts,
  } = await getBlockchain();
  
  const webSocketWeb3 = web3sockets[chainName];
  const contract = wsContracts[chainName];
  
  const currentBlockNumber = await webSocketWeb3.eth.getBlockNumber();
  const lastBlockNumber = (await getDynamoItem(
    ids.lastCachedBlockAccount,
    tableNames[chainName + 'Account']
  )).number || 0;

  // Catch up on missing blocks.
  if (currentBlockNumber !== lastBlockNumber) {
    const {web3sockets} = await getBlockchain();
    const events = await getPastEvents({
      chainName,
      contractName: 'Account',
      lastBlockNumber,
    });
    if (events.length > 0) {
      await processEventsAccount({
        // contract: webSocketContract,
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
          // contract: webSocketContract,
          event,
          chainName,
        });
        accept();
      }
    });
  });
}
async function initCaches({wsContracts, webSockets}) {
  /* const {
    contracts,
    web3sockets,
    wsContracts,
  } = await getBlockchain(); */
  
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
      _logCache(chainName + ' NFT', initNftCache({chainName})),
      _logCache(chainName + ' Account', initAccountCache({chainName})),
    ]);
  }));
}

async function processEventNft({contract, wsContracts, event, isMainnet, chainName}) {
  let {tokenId, hash, key, value} = event.returnValues;

  if (tokenId) {
    try {
      const storeEntries = [];
      const {
        mainnetDepositedEntries,
        mainnetWithdrewEntries,
        sidechainDepositedEntries,
        sidechainWithdrewEntries,
        polygonDepositedEntries,
        polygonWithdrewEntries,
      } = await getAllWithdrawsDeposits('NFT')(chainName);
      
      const token = await getChainNft('NFT')(chainName)(
        tokenId,
        storeEntries,
        mainnetDepositedEntries,
        mainnetWithdrewEntries,
        sidechainDepositedEntries,
        sidechainWithdrewEntries,
        polygonDepositedEntries,
        polygonWithdrewEntries,
      );

      if (token?.properties.hash) {
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

async function processEventsNft({events, currentBlockNumber, chainName}) {
  const seenTokenIds = {};
  const tokenIds = events.map(event => {
    let {tokenId} = event.returnValues;
    if (typeof tokenId === 'string') {
      tokenId = parseInt(tokenId, 10);
      if (!seenTokenIds[tokenId]) {
        seenTokenIds[tokenId] = true;
        return tokenId;
      } else {
        return null;
      }
    } else {
      return null;
    }
  }).filter(tokenId => tokenId !== null);

  console.log('process events', tokenIds.length);

  const storeEntries = [];
  const {
    mainnetDepositedEntries,
    mainnetWithdrewEntries,
    sidechainDepositedEntries,
    sidechainWithdrewEntries,
    polygonDepositedEntries,
    polygonWithdrewEntries,
  } = await getAllWithdrawsDeposits('NFT')(chainName);
  for (const tokenId of tokenIds) {
    const token = await getChainNft('NFT')(chainName)(
      tokenId,
      storeEntries,
      mainnetDepositedEntries,
      mainnetWithdrewEntries,
      sidechainDepositedEntries,
      sidechainWithdrewEntries,
      polygonDepositedEntries,
      polygonWithdrewEntries,
    );

    if (token?.properties.hash) {
      await putDynamoItem(tokenId, token, tableNames[chainName + 'Nft']);
    }
  }
  
  await putDynamoItem(ids.lastCachedBlockNft, {number: currentBlockNumber}, tableNames.mainnetsidechainNft);
}

async function processEventAccount({contract, event, chainName}) {
  // console.log('got account event', event);
  const {owner} = event.returnValues;

  if (owner) {
    try {
      const account = await getChainAccount({
        address: owner,
        chainName,
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
async function processEventsAccount({contract, events, currentBlockNumber, chainName}) {
  const owners = events.map(e => {
    let {owner} = e.returnValues;
    owner = owner.toLowerCase();
    return owner;
  });

  for (const owner of owners) {
    const account = await getChainAccount({
      address: owner,
      chainName,
    });
    await putDynamoItem(owner, account, tableNames[chainName + 'Account']);
  }
  
  await putDynamoItem(ids.lastCachedBlockAccount, {number: currentBlockNumber}, tableNames[chainName + 'Account']);
}

module.exports = {
  initCaches,
};