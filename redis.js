const stream = require('stream');
const redis = require('redis');
const redisearch = require('redis-redisearch');
redisearch(redis);
const {makePromise} = require('./utils.js');
const {redisKey} = require('./config.json');

// c = r.createClient(); c.auth('lol', err => {c.hset('cities', 'id', 'A Town Created from Grafting.', err => { c.hget('cities', 'id', console.log); }); c.on('error', console.warn); }); c.ft_create.apply(c, 'idx SCHEMA id TEXT SORTABLE'.split(' ').concat([console.warn])); 1

let redisClient = null;
function connect(port, host) {
  return new Promise((accept, reject) => {
    redisClient = redis.createClient(port, host);
    redisClient.auth(redisKey, err => {
      if (!err) {
        redisClient.ft_create.apply(redisClient, 'idx SCHEMA id NUMERIC SORTABLE currentOwnerAddress TEXT currentLocation TEXT description TEXT minterAddress TEXT ownerAddress TEXT properties TEXT'.split(' ').concat([err => {
          if (!err) {
            accept();
          } else {
            reject(err);
          }
        }]));
      } else {
        reject(err);
      }
    });
  });
}

async function getRedisItem(id, TableName) {
  const p = makePromise();
  redisClient.hgetall(`${TableName}:${id}`, (err, result) => {
    if (!err) {
      for (const k in result) {
        result[k] = JSON.parse(result[k]);
      }
      // console.log('got result', result);
      p.accept({
        Item: result,
      });
    } else {
      p.reject(err);
    }
  }); 
  return await p;
}

async function putRedisItem(id, data, TableName) {
  const args = [
    `${TableName}:${id}`,
  ];
  for (const k in data) {
    args.push(k, JSON.stringify(data[k]));
  }
  // console.log('putting', args);
  const p = makePromise();
  args.push(err => {
    if (!err) {
      // console.log('accept');
      p.accept();
    } else {
      console.warn('error', err);
      p.reject(err);
    }
  });
  redisClient.hmset.apply(redisClient, args); 
  await p;
}

async function getRedisAllItems(TableName = defaultDynamoTable) {
  throw new Error('not implemented');
  /* const params = {
    TableName,
  };

  try {
    const o = await ddbd.scan(params).promise();
    const items = (o && o.Items) || [];
    return items;
  } catch (e) {
    console.error(e);
    return null;
  } */
}

const parseRedisItems = result => {
  const [numItems] = result;
  const items = Array(numItems);
  for (let i = 0; i < numItems; i++) {
    // const k = result[1 + i * 2];
    const args = result[1 + i * 2 + 1];
    const o = {};
    for (let j = 0; j < args.length; j += 2) {
      const k = args[j];
      const s = args[j + 1];
      const v = JSON.parse(s);
      o[k] = v;
    }
    items[i] = o;
  }
  return items;
};

module.exports = {
  connect,
  redisClient,
  getRedisItem,
  putRedisItem,
  getRedisAllItems,
  parseRedisItems,
};