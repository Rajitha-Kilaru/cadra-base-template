const { Pool } = require('pg');

let _pool = null;
let _connStr = '';

function getPool() {
  if (!_pool) {
    _connStr = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '';
    const ssl = !_connStr.includes('localhost') && !_connStr.includes('127.0.0.1')
      ? { rejectUnauthorized: false }
      : false;
    _pool = new Pool({ connectionString: _connStr, ssl });
  }
  return _pool;
}

function resetPool() {
  if (_pool) {
    _pool.end().catch(() => {});
    _pool = null;
  }
}

function withTransaction(fn) {
  const p = getPool();
  return p.connect().then(client => {
    return client.query('BEGIN')
      .then(() => fn(client))
      .then(result =>
        client.query('COMMIT').then(() => result)
      )
      .catch(err =>
        client.query('ROLLBACK').then(() => {
          throw err;
        })
      )
      .finally(() => client.release());
  });
}

module.exports = { getPool, resetPool, withTransaction, pool: { connect: (...a) => getPool().connect(...a), query: (...a) => getPool().query(...a), end: (...a) => getPool().end(...a) } };