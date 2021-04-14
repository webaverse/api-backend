const stream = require('stream');
const redis = require('redis');
const redisearch = require('redis-redisearch');
redisearch(redis);
const {makePromise} = require('./utils.js');

// c = r.createClient(); c.auth('lol', err => {c.hset('cities', 'id', 'A Town Created from Grafting.', err => { c.hget('cities', 'id', console.log); }); c.on('error', console.warn); }); c.ft_create.apply(c, 'idx SCHEMA id TEXT SORTABLE'.split(' ').concat([console.warn])); 1

const redisClient = redis.createClient();
const redisPassword = 'lol';
redisClient.auth(redisPassword, err => {
  if (!err) {
    redisClient.ft_create.apply(redisClient, 'idx SCHEMA id NUMERIC SORTABLE currentOwnerAddress TEXT currentLocation TEXT description TEXT minterAddress TEXT ownerAddress TEXT properties TEXT'.split(' ').concat([err => {
      if (err) {
        console.warn(err);
      }
    }]));
  } else {
    console.warn(err);
  }
});

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
      console.log('accept');
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

module.exports = {
  redisClient,
  getRedisItem,
  putRedisItem,
  getRedisAllItems,
};