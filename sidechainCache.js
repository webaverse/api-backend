const Web3 = require('web3');
const AWS = require('aws-sdk');
const config = require('./config.json');
const fetch = require('node-fetch');

const { accessKeyId, secretAccessKey } = config;
const awsConfig = new AWS.Config({
  credentials: new AWS.Credentials({
    accessKeyId,
    secretAccessKey,
  }),
  region: 'us-west-1',
});

const backfill = async () => {
  const addresses = await fetch('https://contracts.webaverse.com/config/addresses.js').then(res => res.text()).then(s => JSON.parse(s.replace(/^\s*export\s*default\s*/, '')));
  const abis = await fetch('https://contracts.webaverse.com/config/abi.js').then(res => res.text()).then(s => JSON.parse(s.replace(/^\s*export\s*default\s*/, '')));

  const web3 = {
    rinkebySidechain: new Web3(new Web3.providers.HttpProvider("https://rinkebysidechain.exokit.org"))
  };

  const contracts = {
    rinkebySidechain: {
      NFT: new web3.rinkebySidechain.eth.Contract(abis.NFT, addresses.rinkebysidechain.NFT),
      LAND: new web3.rinkebySidechain.eth.Contract(abis.LAND, addresses.rinkebysidechain.LAND),
    },
  };

  console.time("timer");
  contracts.rinkebySidechain.NFT.getPastEvents("Transfer", {
    fromBlock: 0,
    toBlock: "latest"
  }, (error, result) => {
    error ? console.error(error) : console.log(result);
    console.timeEnd("timer");

    // fetch meta data and dump into DB
  });
}

backfill();





