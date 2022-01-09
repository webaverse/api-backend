const url = require("url");
const { getBlockchain } = require("../blockchain.js");

const {
  getChainNft,
} = require("../tokens.js");

const defaultAvatarPreview = 'https://preview.webaverse.com/[https://raw.githubusercontent.com/avaer/vrm-samples/master/vroid/male.vrm]/preview.png';
const defaultHomeSpacePreview = 'https://desktopography.net/wp-content/uploads/bfi_thumb/desk_ranko_blazina-34qm8ho3dk1rd512mo5pfk.jpg'

const getChainToken = getChainNft("NFT");

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
      // console.log('got p', p);
      let match;
      if ((match = p.match(/^\/(0x[a-f0-9]+)$/))) {
        const address = match[1];
        const { contracts } = await getBlockchain();
        console.log(chainName);
        const tokenIds = await contracts[chainName].NFT.methods
          .getTokenIdsOf(address)
          .call();

        let username = await contracts[chainName].Account.methods
          .getMetadata(address, "name")
          .call();
        if (!username) {
          username = "Anonymous";
        }
        let avatarPreview = await contracts[chainName].Account.methods
          .getMetadata(address, "avatarPreview")
          .call();
        if (!avatarPreview) {
          avatarPreview = defaultAvatarPreview;
        }
        const balance = await contracts[chainName].FT.methods
          .balanceOf(address)
          .call();

        const storeEntries = [];
        const tokens = await Promise.all(
          tokenIds.map((tokenId) =>
            getChainToken(chainName)(tokenId, storeEntries, [], [], [], [], [], [])
          )
        );

        const tokens2 = [];
        for (const token of tokens) {
          // if (token) {
          if (
            !tokens2.some(
              (token2) => token2.properties.hash === token.properties.hash
            )
          ) {
            tokens2.push(token);
          }
          // }
        }

        const result = {
          username,
          avatarPreview,
          homeSpacePreview: defaultHomeSpacePreview,
          balance,
          tokens: tokens2,
          loadout: tokens2.length > 0 ? tokens.slice(0, 1) : [],
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