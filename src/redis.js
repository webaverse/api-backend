const redis = require('redis');
const redisearch = require('redis-redisearch');
const { makePromise } = require('./utils.js');
const { ids } = require('./constants.js');
const { redisKey } = require('../config.json');

redisearch(redis);

let redisClient = null;
let loadPromise = null;
async function connect(port, host) {
  if (!loadPromise) {
    loadPromise = new Promise((accept, reject) => {
      redisClient = redis.createClient(port, host);
      try {
        redisClient.auth(redisKey, err => {
          if (!err) {
            accept();
          } else {
            reject(err);
          }
        });
      } catch (error) {
        console.error("Unable to connect to redis -- is redis running?");
      }
    });
  }
  await loadPromise;
}
function getRedisClient() {
  return redisClient;
}

async function getRedisItem(id, TableName) {
  const p = makePromise();
  redisClient.hgetall(`${TableName}:${id}`, (err, result) => {
    if (!err) {
      for (const k in result) {
        result[k] = JSON.parse(result[k]);
      }
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

  const p = makePromise();
  args.push(err => {
    if (!err) {
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
  let keys = await new Promise((accept, reject) => {
    redisClient.keys(`${TableName}:*`, (err, result) => {
      if (!err) {
        accept(result);
      } else {
        reject(err);
      }
    });
  });
  const filterKey = `${TableName}:${ids.lastCachedBlockAccount}`;
  keys = keys.filter(key => key !== filterKey);

  const _runJobs = jobs => new Promise((accept, reject) => {
    const maxTasksInFlight = 100;
    let tasksInFlight = 0;
    const _recurse = async () => {
      if (tasksInFlight < maxTasksInFlight && jobs.length > 0) {
        tasksInFlight++;
        try {
          await jobs.shift()();
        } catch (err) {
          console.warn(err);
        } finally {
          tasksInFlight--;
        }
        _recurse();
      } else if (tasksInFlight === 0) {
        accept();
      }
    };
    for (let i = 0; i < jobs.length; i++) {
      _recurse();
    }
  });

  const items = [];
  await _runJobs(keys.map(k => async () => {
    const item = await new Promise((accept, reject) => {
      redisClient.hgetall(k, (err, result) => {
        if (!err) {
          accept(result);
        } else {
          reject(err);
        }
      });
    });
    items.push(item);
  }));
  return items;
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
  getRedisClient,
  getRedisItem,
  putRedisItem,
  getRedisAllItems,
  parseRedisItems,
};