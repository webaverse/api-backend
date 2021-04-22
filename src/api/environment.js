require('dotenv').config();

const development = !process.env.PRODUCTION
const production = process.env.PRODUCTION

module.exports = {
    development,
    production
}