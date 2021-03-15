const {getDynamoItem, putDynamoItem} = require('./aws.js');
const {getChainNft} = require('./tokens.js');

const ids = {
  lastCachedBlock: 'lastCachedBlock',
};

async function initCache({addresses, contracts, wsContracts, sockets}) {
  const contract = wsContracts.mainnetsidechain;
  const socket = sockets.mainnet;

  const currentBlockNumber = await socket.eth.getBlockNumber();
  const lastBlockNumber =
    (await getDynamoItem(ids.lastCachedBlock)).number || 0;

  // Catch up on missing blocks.
  if (currentBlockNumber !== lastBlockNumber) {
    const events = await getPastEvents(contracts.mainnetsidechain, lastBlockNumber);
    if (events.length) await processEvents({addresses, contract, contracts, wsContracts, events});

    // Set last block number.
    putDynamoItem(ids.lastCachedBlock, {number: currentBlockNumber})
      .catch(console.error);
  }

  // Watch for new events.
  wsContracts.mainnet.NFT.events.allEvents({fromBlock: 'latest'}, async (error, event) => {
    console.debug( 'EVENT:', event )
    if (error) console.log('Error getting event: ' + error);
    else await processEvent({addresses, contract: wsContracts.mainnetsidechain, event});
  })
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

      if (token.properties.hash)
        putDynamoItem(token.id, token)
          .catch(console.error);
    }

    catch ( e ) { console.error(e); }
  }
}

async function processEvents({addresses, contracts, events}) {
  const responses = {};
  const tokens = {};

  // Get tokenId from each event and add it to the URI table.
  for (const event of events) {
    const {tokenId} = event.returnValues;

    if (tokenId) {
      try {
        const res = getDynamoItem(tokenId);
        if (res) responses[tokenId] = res;
      }

      catch ( e ) { console.error(e); }
    }
  }

  await Promise.all(Object.entries(responses).map(async entry => {
    // tokens[entry[0]] = (await entry[1]).Item;

    // Map each response to a token.
    const token = await getChainNft({
      addresses,
      contract: contracts.mainnetsidechain,
      tokenId: entry[0],
    })

    if (token.properties.hash)
      tokens[entry[0]] = token;
  }))

  // Cache each token.
  Object.entries(tokens).forEach(entry =>
    putDynamoItem(entry[0], entry[1])
      .catch(console.error)
  )
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
}
