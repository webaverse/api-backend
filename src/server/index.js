const express = require('express');
const expressJSDocSwagger = require('express-jsdoc-swagger');

const { createWallet } = require("./routes/wallet.js");
const { listTokens, createToken, readToken, updateToken, deleteToken, sendToken, transferToken, readTokenRange } = require("./routes/tokens.js");
const { getBlockchain } = require('../blockchain.js');

const pkg = require('../../package.json');

const options = {
  info: {
    version: pkg.version,
    title: "Webaverse API Documentation",
    description: "Documentation for the Webaverse API server",
    license: {
      name: pkg.license,
    },
  },
  filesPattern: '*.js',
  swaggerUIPath: '/api-docs',
  baseDir: __dirname,
  exposeSwaggerUI: true,
  exposeApiDocs: true,
  apiDocsPath: '/v3/api-docs'
};

const app = express();
const PORT = 3000;

let blockchain;

(async () => {
  blockchain = await getBlockchain();
})()

expressJSDocSwagger(app)(options);

/**
 * Response for user account creation and retrieval
 * @typedef {object} TokenRequest
 * @property {string} id.required - The ID of the token
 */

/**
 * Response for user account creation and retrieval
 * @typedef {object} TokenResponse
 * @property {string} id.required - The ID of the token
 * @property {string} hash.required - The hash of the token's data
 * @property {string} name - The name of the token
 * @property {string} description - The description of the token
 */

/**
 * Response for user account creation and retrieval
 * @typedef {object} WalletRequest
 * @property {string} id.required - The ID of the token
 */

/**
 * Response for user account creation and retrieval
 * @typedef {object} WalletResponse
 * @property {string} address.required - The address of the user
 * @property {object} inventory - The address of the user
 */

/**
 * POST /api/v1/wallet
 * @summary Create a wallet for a user
 * @property {string} userId - Provide a unique token associated with this user (can be database account ID)
 * @return {WalletResponse} 200 - success response
 * @return {object} 403 - forbidden request response
 */
 app.post('/api/v1/wallet', async (req, res) => {
  return await createWallet(req, res);
});
 
/**
 * GET /api/v1/tokens
 * @summary List tokens for a user
 * @return {TokenResponse} 200 - success response
 * @return {object} 403 - forbidden request response
 * @property {string} tokenId - Token to retrieve
 * @property {string} TODO - Update properties
 */
 app.get('/api/v1/tokens/:address/:mainnetAddress', async (req, res) => {
  return await listTokens(req, res, blockchain);
});

/**
 * GET /api/v1/token/:tokenId
 * @summary Retrieve data for a non-fungible token
 * @return {TokenResponse} 200 - success response
 * @return {object} 403 - forbidden request response
 * @property {string} tokenId - Token to retrieve
 */
 app.get('/api/v1/token/:tokenId', async (req, res) => {
  return await readToken(req, res);
});

/**
 * GET /api/v1/token/:tokenStartId/:tokenEndId
 * @summary Retrieve a range of tokens
 * @return {TokenResponse} 200 - success response
 * @return {object} 403 - forbidden request response
 * @property {string} tokenStartId - First token to retrieve
 * @property {string} tokenEndId - Last token in range to retrieve
 */
 app.get('/api/v1/token/:tokenStartId/:tokenEndId', async (req, res) => {
  return await readTokenRange(req, res);
});

/**
 * POST /api/v1/token
 * @summary Create a non-fungible token
 * @return {TokenResponse} 200 - success response
 * @return {object} 403 - forbidden request response
 * @property {string} userId - Mint the token for this user
 */
 app.post('/api/v1/token', async (req, res) => {
  return await createToken(req, res, blockchain);
});

/**
 * PUT /api/v1/token
 * @summary Update data for a non-fungible token
 * @return {TokenResponse} 200 - success response
 * @return {object} 403 - forbidden request response
 * @property {string} tokenId - Token to update
 * @property {string} TODO - Update properties
 */
 app.put('/api/v1/token', async (req, res) => {
  return await updateToken(req, res, blockchain);
});

/**
 * DELETE /api/v1/token
 * @summary Burn a token forever
 * @return {TokenResponse} 200 - success response
 * @return {object} 403 - forbidden request response
 * @property {string} tokenId - Token to delete
 */
 app.delete('/api/v1/token', async (req, res) => {
  return await deleteToken(req, res, blockchain);
});

/**
 * POST /api/v1/token/send
 * @summary Send this token from one user to another
 * @return {TokenResponse} 200 - success response
 * @return {object} 403 - forbidden request response
 * @property {string} tokenId - Token to be sent
 * @property {string} senderId - Token sent by this user
 * @property {string} receiverId - Token received by this user
 */
 app.post('/api/v1/token/send', async (req, res) => {
  return await sendToken(req, res, blockchain);
});

/**
 * POST /api/v1/token/transfer
 * @summary Send this token from one user to another
 * @return {TokenResponse} 200 - success response
 * @return {object} 403 - forbidden request response
 * @property {string} tokenId - Token to be sent
 * @property {string} senderId - Token sent by this user
 * @property {string} receiverId - Token received by this user
 */
 app.post('/api/v1/token/transfer', async (req, res) => {
  return await transferToken(req, res, blockchain);
});

app.listen(PORT, () => console.log(`App listening at http://localhost:${PORT}`));