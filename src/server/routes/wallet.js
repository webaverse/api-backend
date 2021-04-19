const bip39 = require('bip39');
const { hdkey } = require('ethereumjs-wallet');
const { setCorsHeaders } = require("../../utils.js");
const { ResponseStatus } = require("../enums.js");
const { development } = require("../environment.js");
// Generates a new mnemonic, private key and public address and hands the mnemonic back
async function createWallet(req, res) {
    if(development) setCorsHeaders(res);
    const mnemonic = bip39.generateMnemonic();
    const wallet = hdkey.fromMasterSeed(bip39.mnemonicToSeedSync(mnemonic)).derivePath(`m/44'/60'/0'/0/0`).getWallet();
    const address = wallet.getAddressString();
    return res.json({ status: ResponseStatus.Success, mnemonic, address });
}

module.exports = {
    createWallet
}
