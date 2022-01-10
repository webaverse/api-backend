const url = require("url");
const fetch = require("node-fetch");
const defaultAvatarPreview = 'https://preview.webaverse.com/[https://raw.githubusercontent.com/avaer/vrm-samples/master/vroid/male.vrm]/preview.png';
const defaultHomeSpacePreview = 'https://desktopography.net/wp-content/uploads/bfi_thumb/desk_ranko_blazina-34qm8ho3dk1rd512mo5pfk.jpg'
const ERC20ABI = require('../abi/WebaverseERC20.json');

const {
  getBlockchain
} = require('../blockchain');

const {
  WebaverseERC20Address,
  blockchainSyncServerUrl,
} = require("../constants");

const _handleProfile = (chainName) => async (req, res) => {
  const _respond = (statusCode, body) => {
    res.statusCode = statusCode;
    _setCorsHeaders(res);
    res.end(body);
  };
  const _setCorsHeaders = (res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "*");
  };

  try {
    const { method } = req;

    if (method === "GET") {
      const { pathname: p } = url.parse(req.url, true);
      let match;
      if ((match = p.match(/^\/(0x[a-f0-9]+)$/))) {
        const address = match[1];
        const account = await fetch(`${blockchainSyncServerUrl}/account/${address}`).then(res => res.json());
        const username = account.name || 'Anonymous';
        let avatarPreview = account.avatarPreview || defaultAvatarPreview;

        const { web3 } = await getBlockchain();
        const ftContract = new web3.mainnetsidechain.eth.Contract(ERC20ABI.abi, WebaverseERC20Address);
        const balanceWei = await ftContract.methods.balanceOf(address).call();
        const balance = web3.mainnetsidechain.utils.fromWei(balanceWei, 'ether');
        const storeEntries = [];
        const tokens = await fetch(`${blockchainSyncServerUrl}/webaverse-erc721/?owner=${address}`).then(res => res.json());
        const tokens2 = [];
        for (const token of tokens) {
          if (
            !tokens2.some(
              (token2) => token2.properties.hash === token.properties.hash
            )
          ) {
            tokens2.push(token);
          }
        }

        const result = {
          username,
          avatarPreview,
          homeSpacePreview: defaultHomeSpacePreview,
          balance,
          tokens: tokens2,
          loadout: tokens2.length > 0 ? tokens.slice(0, 1) : [],
          storeEntries,
        };
        _setCorsHeaders(res);
        res.setHeader("Content-Type", "application/json");
        _respond(200, JSON.stringify(result));
      } else {
        _respond(404, "not found");
      }
    } else {
      _respond(404, "not found");
    }
  } catch (err) {
    console.warn(err);

    _respond(
      500,
      JSON.stringify({
        error: err.stack,
      })
    );
  }
};

module.exports = {
  _handleProfile,
};