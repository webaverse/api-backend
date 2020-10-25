const _setCorsHeaders = res => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
    return res;
};
function getExt(fileName) {
  const match = fileName.match(/\.([^\.]+)$/);
  return match && match[1].toLowerCase();
}
module.exports = {
  _setCorsHeaders,
  getExt,
}
