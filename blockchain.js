const dns = require('dns');
const https = require('https');
const fetch = require('node-fetch');
const Web3 = require('web3');
const {polygonVigilKey, ethereumHost} = require('./constants.js');

const config = require('./config.json');
const {
  infuraProjectId,
} = config;

let addresses,
  abis,
  web3,
  web3sockets,
  contracts,
  wsContracts;

const BlockchainNetworks = [
  "mainnet",
  "mainnetsidechain",
  "polygon",
  "testnet",
  "testnetsidechain",
  "testnetpolygon",
];

const loadPromise = (async() => {
  addresses = await fetch('https://contracts.webaverse.com/config/addresses.js').then(res => res.text()).then(s => JSON.parse(s.replace(/^\s*export\s*default\s*/, '')));
  abis = await fetch('https://contracts.webaverse.com/config/abi.js').then(res => res.text()).then(s => JSON.parse(s.replace(/^\s*export\s*default\s*/, '')));
  const [
    ethereumHostAddress,
    newPorts,
  ] = await Promise.all([
    new Promise((accept, reject) => {
      dns.resolve4(ethereumHost, (err, addresses) => {
        if (!err) {
          if (addresses.length > 0) {
            accept(addresses[0]);
          } else {
            reject(new Error('no addresses resolved for ' + ethereumHost));
          }
        } else {
          reject(err);
        }
      });
    }),
    (async () => {
      const j = await new Promise((accept, reject) => {
        const proxyReq = https.request('https://contracts.webaverse.com/config/ports.js', proxyRes => {
          const bs = [];
          proxyRes.on('data', b => {
            bs.push(b);
          });
          proxyRes.on('end', () => {
            accept(JSON.parse(Buffer.concat(bs).toString('utf8').slice('export default'.length)));
          });
          proxyRes.on('error', err => {
            reject(err);
          });
        });
        proxyReq.end();
      });
      return j;
    })(),
  ]);
  
  // console.log('ports', {ethereumHostAddress, newPorts});
  
  const ports = newPorts;
  const gethNodeUrl = `http://${ethereumHostAddress}`;
  const gethNodeWSUrl = `ws://${ethereumHostAddress}`;

  web3 = {
    mainnet: new Web3(new Web3.providers.HttpProvider(
      `https://mainnet.infura.io/v3/${infuraProjectId}`
    )),
    mainnetsidechain: new Web3(new Web3.providers.HttpProvider(
      `${gethNodeUrl}:${ports.mainnetsidechain}`
    )),

    testnet: new Web3(new Web3.providers.HttpProvider(
      `https://rinkeby.infura.io/v3/${infuraProjectId}`
    )),
    testnetsidechain: new Web3(new Web3.providers.HttpProvider(
      `${gethNodeUrl}:${ports.testnetsidechain}`
    )),
    
    polygon: new Web3(new Web3.providers.HttpProvider(
      `https://rpc-mainnet.maticvigil.com/v1/${polygonVigilKey}`
    )),
    testnetpolygon: new Web3(new Web3.providers.HttpProvider(
      `https://rpc-mumbai.maticvigil.com/v1/${polygonVigilKey}`
    )),
  };

  web3sockets = {
    mainnet: new Web3(new Web3.providers.WebsocketProvider(
      `wss://mainnet.infura.io/ws/v3/${infuraProjectId}`
    )),
    mainnetsidechain: new Web3(new Web3.providers.WebsocketProvider(
      `${gethNodeWSUrl}:${ports.mainnetsidechainWs}`
    )),

    testnet: new Web3(new Web3.providers.WebsocketProvider(
      `wss://rinkeby.infura.io/ws/v3/${infuraProjectId}`
    )),
    testnetsidechain: new Web3(new Web3.providers.WebsocketProvider(
      `${gethNodeWSUrl}:${ports.testnetsidechainWs}`
    )),
    
    polygon: new Web3(new Web3.providers.WebsocketProvider(
      `wss://rpc-mainnet.maticvigil.com/ws/v1/${polygonVigilKey}`
    )),
    testnetpolygon: new Web3(new Web3.providers.WebsocketProvider(
      `wss://rpc-mumbai.maticvigil.com/ws/v1/${polygonVigilKey}`
    )),
  };
  
  contracts = {};
  BlockchainNetworks.forEach(network => {
    contracts[network] = {
      Account: new web3[network].eth.Contract(abis.Account, addresses[network].Account),
      FT: new web3[network].eth.Contract(abis.FT, addresses[network].FT),
      FTProxy: new web3[network].eth.Contract(abis.FTProxy, addresses[network].FTProxy),
      NFT: new web3[network].eth.Contract(abis.NFT, addresses[network].NFT),
      NFTProxy: new web3[network].eth.Contract(abis.NFTProxy, addresses[network].NFTProxy),
      Trade: new web3[network].eth.Contract(abis.Trade, addresses[network].Trade),
      LAND: new web3[network].eth.Contract(abis.LAND, addresses[network].LAND),
      LANDProxy: new web3[network].eth.Contract(abis.LANDProxy, addresses[network].LANDProxy),
    }
  })
  
  wsContracts = {};
  BlockchainNetworks.forEach(network => {
    wsContracts[network] = {
      Account: new web3sockets[network].eth.Contract(abis.Account, addresses[network].Account),
      FT: new web3sockets[network].eth.Contract(abis.FT, addresses[network].FT),
      FTProxy: new web3sockets[network].eth.Contract(abis.FTProxy, addresses[network].FTProxy),
      NFT: new web3sockets[network].eth.Contract(abis.NFT, addresses[network].NFT),
      NFTProxy: new web3sockets[network].eth.Contract(abis.NFTProxy, addresses[network].NFTProxy),
      Trade: new web3sockets[network].eth.Contract(abis.Trade, addresses[network].Trade),
      LAND: new web3sockets[network].eth.Contract(abis.LAND, addresses[network].LAND),
      LANDProxy: new web3sockets[network].eth.Contract(abis.LANDProxy, addresses[network].LANDProxy),
    }
  });
})();

async function getPastEvents({
  chainName,
  contractName,
  eventName = 'allEvents',
  fromBlock = 0,
  toBlock = 'latest',
} = {}) {
  const {wsContracts} = await getBlockchain();
  // console.log('got contracts', Object.keys(wsContracts), chainName, !!wsContracts[chainName]);
  const chainContracts = wsContracts[chainName];
  try {
    return await chainContracts[contractName].getPastEvents(
      eventName,
      {
        fromBlock,
        toBlock,
      }
    );
  } catch(e) {
    console.error(e);
    return [];
  }
}

async function getBlockchain() {
  await loadPromise;
  return {
    addresses,
    abis,
    web3,
    web3sockets,
    contracts,
    wsContracts,
  };
}

module.exports = {
  getBlockchain,
  getPastEvents,
};