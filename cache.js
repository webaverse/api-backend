const {getDynamoItem, putDynamoItem} = require('./aws.js');
const {getChainNft} = require('./tokens.js');

const ids = {
  lastCachedBlock: 'lastCachedBlock',
};

async function initCache({addresses, wsContracts, webSockets}) {
  const webSocketWeb3 = webSockets.mainnetsidechain;
  const webSocketContract = wsContracts.mainnetsidechain;

  const currentBlockNumber = await webSocketWeb3.eth.getBlockNumber();
  const lastBlockNumber = (await getDynamoItem(ids.lastCachedBlock)).number || 0;

  // Catch up on missing blocks.
  if (currentBlockNumber !== lastBlockNumber) {
    const events = await getPastEvents(webSocketContract, lastBlockNumber);
    if (events.length > 0) {
      await processEvents({addresses, contract: webSocketContract, events, currentBlockNumber});
    }
  }

  // Watch for new events.
  wsContracts.mainnet.NFT.events.allEvents({fromBlock: 'latest'}, async (error, event) => {
    console.debug('EVENT:', event);
    if (error) {
      console.log('Error getting event: ' + error);
    } else {
      await processEvent({addresses, contract: webSocketContract, event});
    }
  });
}

async function processEvent({addresses, contract, event}) {
  const {tokenId} = event.returnValues;

  if (tokenId) {
    try {
      const token = await getChainNft({
        addresses,
        contract,
        tokenId,
      });

      if (token.properties.hash) {
        await putDynamoItem(token.id, token)
          // .catch(console.error);
      }
    } catch (e) {
      console.error(e);
    }
  }

  const {blockNumber} = event;
  await putDynamoItem(ids.lastCachedBlock, {number: blockNumber});
}

async function processEvents({addresses, contract, events, currentBlockNumber}) {
  const responses = {};
  // const tokens = {};

  // Get tokenId from each event and add it to the URI table.
  for (const event of events) {
    const {tokenId} = event.returnValues;

    if (tokenId) {
      try {
        const res = getDynamoItem(tokenId);
        if (res) {
          responses[tokenId] = res;
        }
      } catch (e) {
        console.error(e);
      }
    }
  }

  await Promise.all(Object.entries(responses).map(async entry => {
    // tokens[entry[0]] = (await entry[1]).Item;

    // Map each response to a token.
    const token = await getChainNft({
      addresses,
      contract,
      tokenId: entry[0],
    })

    // Cache each token.
    if (token.properties.hash) {
      // tokens[entry[0]] = token;
      await putDynamoItem(entry[0], token);
    }
  }));
  
  await putDynamoItem(ids.lastCachedBlock, {number: currentBlockNumber})
}

async function getPastEvents(
  contract,
  fromBlock = 0,
  toBlock = 'latest'
) {
  try {
    return await contract.NFT.getPastEvents(
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
  initCache,
};