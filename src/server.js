const express = require('express');
const expressJSDocSwagger = require('express-jsdoc-swagger');
const pkg = require('../package.json');

const options = {
  info: {
    version: pkg.version,
    title: pkg.description,
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
 * @return {WalletResponse} 200 - success response
 * @return {object} 403 - forbidden request response
 * @property {string} userId - Provide a unique token associated with this user (can be database account ID)
 */
 app.post('/api/v1/wallet', (req, res) => {
  return res.json({
    address: "",
  });
});


/**
 * GET /api/v1/wallet
 * @summary Get wallet for a user
 * @return {WalletResponse} 200 - success response
 * @return {object} 403 - forbidden request response
 * @property {string} userId - Provide a unique token associated with this user (can be database account ID)
 */
 app.get('/api/v1/wallet', (req, res) => {
  return res.json({
    address: "",
  });
});

/**
 * GET /api/v1/tokens
 * @summary List tokens for a user
 * @return {TokenResponse} 200 - success response
 * @return {object} 403 - forbidden request response
 * @property {string} tokenId - Token to retrieve
 * @property {string} TODO - Update properties
 */
 app.get('/api/v1/token', (req, res) => {
  return res.json({
    address: "",
  });
});

/**
 * GET /api/v1/token
 * @summary Retrieve data for a non-fungible token
 * @return {TokenResponse} 200 - success response
 * @return {object} 403 - forbidden request response
 * @property {string} tokenId - Token to retrieve
 * @property {string} TODO - Update properties
 */
 app.get('/api/v1/token', (req, res) => {
  return res.json({
    address: "",
  });
});

/**
 * POST /api/v1/token
 * @summary Create a non-fungible token
 * @return {TokenResponse} 200 - success response
 * @return {object} 403 - forbidden request response
 * @property {string} userId - Mint the token for this user
 */
 app.post('/api/v1/token', (req, res) => {
  return res.json({
    address: "",
  });
});

/**
 * PUT /api/v1/token
 * @summary Update data for a non-fungible token
 * @return {TokenResponse} 200 - success response
 * @return {object} 403 - forbidden request response
 * @property {string} tokenId - Token to update
 * @property {string} TODO - Update properties
 */
 app.put('/api/v1/token', (req, res) => {
  return res.json({
    address: "",
  });
});

/**
 * DELETE /api/v1/token
 * @summary Burn a token forever
 * @return {TokenResponse} 200 - success response
 * @return {object} 403 - forbidden request response
 * @property {string} tokenId - Token to delete
 */
 app.delete('/api/v1/token', (req, res) => {
  return res.json({
    address: "",
  });
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
 app.post('/api/v1/token/send', (req, res) => {
  return res.json({
    address: "",
  });
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
 app.post('/api/v1/token/transfer', (req, res) => {
  return res.json({
    address: "",
  });
});

app.listen(PORT, () => console.log(`App listening at http://localhost:${PORT}`));