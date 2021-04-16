const jsonParse = (s, d = null) => {
  try {
    return JSON.parse(s);
  } catch (err) {
    return d;
  }
};
const setCorsHeaders = res => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
    return res;
};

function randomString() {
  return Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 5);
}

function getExt(fileName) {
  const match = fileName.match(/\.([^\.]+)$/);
  return match && match[1].toLowerCase();
}

const makePromise = () => {
  let accept, reject;
  const p = new Promise((a, r) => {
    accept = a;
    reject = r;
  });
  p.accept = accept;
  p.reject = reject;
  return p;
};
module.exports = {
  jsonParse,
  setCorsHeaders,
  getExt,
  makePromise,
  randomString
}
