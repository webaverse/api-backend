const puppeteer = require('puppeteer');

const browserPromise = puppeteer.launch({
  args: [
    '--no-sandbox',
    '--no-zygote',
  ],
  headless: true,
});

module.exports = {
  async getBrowser() {
    return await browserPromise;
  },
};