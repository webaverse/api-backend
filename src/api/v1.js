const express = require('express');
const expressJSDocSwagger = require('express-jsdoc-swagger');

const { createWallet } = require("./routes/v1/wallet.js");
const { handleServerSideAuth, authenticateToken } = require("./routes/v1/auth.js");
const { listTokens, createToken, readToken, deleteToken, sendToken, readTokenRange } = require("./routes/v1/tokens.js");

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
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      }
    }
  },
  security: {
    bearerAuth: {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT"
    }
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

// AUTHENTICATION

/**
 * Response for user account creation and retrieval
 * @typedef {object} AuthenticationResponse
 * @property {string} status - The status of the creation request (success/error)
 * @property {string} accessToken - The returned JWT
 * @property {string} error - If the status is error, the error can be read from here 
*/

/**
 * Response for user account creation and retrieval
 * @typedef {object} AuthenticationErrorResponse
 * @property {string} status - The status of the creation request (success/error)
 * @property {string} error - If the status is error, the error can be read from here 
*/

/**
 * POST /api/v1/auth
 * @summary Authorize this user with a shared server-side secret key
 * @return {AuthenticationResponse} 200 - success response
 * @property {string} authSecretKey - Secret key that only the backend infrastructure knows about
 */
app.post('/api/v1/authorizeServer', async (req, res) => {
  return await handleServerSideAuth(req, res);
});

// WALLETS

/**
 * Response for user account creation and retrieval
 * @typedef {object} WalletCreationResponse
 * @property {string} status - The status of the creation request (success/error)
 * @property {string} mnemonic - The private key for the user (to be stored and NEVER shared)
 * @property {string} address - The public key for the user (to be stored)
 * @property {string} error - If the status is error, the error can be read from here 
*/

/**
 * POST /api/v1/wallet
 * @summary Create a wallet for a user
 * @security bearerAuth
 * @return {WalletCreationResponse} 200 - success response
 * @return {AuthenticationErrorResponse} 401 - authentication error response
 */
app.post('/api/v1/wallet', authenticateToken, async (req, res) => {
  return await createWallet(req, res);
});

// TOKENS

/**
 * Response for user account creation and retrieval
 * @typedef {object} TokenResponse
 * @property {string} status - The status of the list request (success/error)
 * @property {object} token - Token object returned
 * @property {string} error - If the status is error, the error can be read from here 
 */

/**
 * Response for user account creation and retrieval
 * @typedef {object} TokenIdResponse
 * @property {string} status - The status of the list request (success/error)
 * @property {string} tokenId - Token id returned
 * @property {string} error - If the status is error, the error can be read from here 
 */

/**
 * Response for user account creation and retrieval
 * @typedef {object} TokenIdListResponse
 * @property {string} status - The status of the list request (success/error)
 * @property {array} tokenIds - Token id returned
 * @property {string} error - If the status is error, the error can be read from here 
 */

/**
 * Response for user account creation and retrieval
 * @typedef {object} TokenListResponse
 * @property {string} status - The status of the list request (success/error)
 * @property {array} tokens - Array of token objects returned
 * @property {string} error - If the status is error, the error can be read from here 
 */

/**
 * Response for user account creation and retrieval
 * @typedef {object} TokenStatusResponse
 * @property {string} status - The status of the list request (success/error)
 * @property {string} error - If the status is error, the error can be read from here 
 */

/**
 * GET /api/v1/tokens
 * @summary List tokens for a user
 * @return {TokenListResponse} 200 - success response
 * @return {AuthenticationErrorResponse} 401 - authentication error response
 * @property {string} address.required - Address of the user to list tokens for
 * @property {string} mainnetAddress - Mainnet address of the user to list tokens for (optional)
 */
app.get('/api/v1/tokens/:address/:mainnetAddress', authenticateToken, async (req, res) => {
  return await listTokens(req, res, blockchain.web3);
});

/**
 * GET /api/v1/token/:tokenId
 * @summary Retrieve data for a non-fungible token
 * @return {TokenResponse} 200 - success response
 * @return {AuthenticationErrorResponse} 401 - authentication error response
 * @property {string} tokenId - Token to retrieve
 */
app.get('/api/v1/token/:tokenId', authenticateToken, async (req, res) => {
  return await readToken(req, res);
});

/**
 * GET /api/v1/token/:tokenStartId/:tokenEndId
 * @summary Retrieve a range of tokens
 * @return {TokenListResponse} 200 - success response
 * @return {AuthenticationErrorResponse} 401 - authentication error response
 * @property {string} tokenStartId - First token to retrieve
 * @property {string} tokenEndId - Last token in range to retrieve
 */
app.get('/api/v1/token/:tokenStartId/:tokenEndId', authenticateToken, async (req, res) => {
  return await readTokenRange(req, res);
});

/**
 * POST /api/v1/token
 * @summary Create a non-fungible token
 * @return {TokenIdsResponse} 200 - success response
 * @return {AuthenticationErrorResponse} 401 - authentication error response
 * @property {string} mnemonic - Mint the token using a user's private key
 * @property {string} resourceHash - IPFS resource hash or other URI
 * @property {number} quantity - Number of tokens to mint

*/
app.post('/api/v1/token', authenticateToken, async (req, res) => {
  return await createToken(req, res, blockchain);
});

/**
 * DELETE /api/v1/token
 * @summary Burn a token forever
 * @return {TokenStatusResponse} 200 - success response
 * @return {AuthenticationErrorResponse} 401 - authentication error response
 * @property {string} tokenId - Token to delete
 */
app.delete('/api/v1/token', authenticateToken, async (req, res) => {
  return await deleteToken(req, res, blockchain);
});

/**
 * POST /api/v1/token/send
 * @summary Send this token from one user to another
 * @return {TokenStatusResponse} 200 - success response
 * @return {AuthenticationErrorResponse} 401 - authentication error response
 * @property {string} tokenId - Token to be sent
 * @property {string} fromUserAddress - Token sent by this user (public address)
 * @property {string} toUserAddress - Token received by this user (public address)
 */
app.post('/api/v1/token/send', authenticateToken, async (req, res) => {
  return await sendToken(req, res, blockchain);
});

// /**
//  * POST /api/v1/token/transfer
//  * @summary Send this token from one user to another
//  * @return {TokenResponse} 200 - success response
//  * @return {object} 401 - forbidden request response
//  * @property {string} tokenId - Token to be sent
//  * @property {string} senderId - Token sent by this user
//  * @property {string} receiverId - Token received by this user
//  */
//  app.post('/api/v1/token/transfer', async (req, res) => {
//   return await transferToken(req, res, blockchain);
// });

app.listen(PORT, () => console.log(`App listening at http://localhost:${PORT}`));