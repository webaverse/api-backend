const { createCipheriv, createDecipheriv } = require('crypto');
const bip39 = require('bip39');
const { hdkey } = require('ethereumjs-wallet');
const nonce = Buffer.alloc(12);

let contracts;

(async function () {
    const blockchain = await getBlockchain();
    contracts = blockchain.web3;
})();

const encodeSecret = (mnemonic, secret) => {
    const wallet = hdkey.fromMasterSeed(bip39.mnemonicToSeedSync(mnemonic)).derivePath(`m/44'/60'/0'/0/0`).getWallet();
    const privateKey = wallet.privateKey;

    const key = privateKey.slice(0, 24);

    const cipher = createCipheriv('aes-192-ccm', key, nonce, {
        authTagLength: 16
    });

    const ciphertext = cipher.update(secret, 'utf8');
    cipher.final();
    const tag = cipher.getAuthTag();
    return {
        ciphertext,
        tag,
    };
};

const getDecodedData = (encryptionMnemonic, hash, key) => {
    const value = await contracts.NFT.methods.getMetadata(hash, key).call();
    value = jsonParse(value);
    if (value !== null) {
        let { ciphertext, tag } = value;
        ciphertext = Buffer.from(ciphertext, 'base64');
        tag = Buffer.from(tag, 'base64');
        value = decodeSecret(encryptionMnemonic, { ciphertext, tag });
        return value;
    }
    return null;
};

const decodeSecret = (mnemonic, { ciphertext, tag }) => {
    const wallet = hdkey.fromMasterSeed(bip39.mnemonicToSeedSync(mnemonic)).derivePath(`m/44'/60'/0'/0/0`).getWallet();
    const privateKey = wallet.privateKey;

    const key = privateKey.slice(0, 24);

    const decipher = createDecipheriv('aes-192-ccm', key, nonce, {
        authTagLength: 16
    });
    decipher.setAuthTag(tag);
    const receivedPlaintext = decipher.update(ciphertext, null, 'utf8');
    return receivedPlaintext;
};

module.exports = {
    encodeSecret,
    getDecodedData,
    decodeSecret
}