// farmsRepo.js — plain parameterised SQL.

async function listFarms(client) {
  const result = await client.query(
    `SELECT id, name, credit_hold, state, created_at, updated_at
     FROM farms
     ORDER BY name`
  );
  return result.rows;
}

async function findFarmById(client, farmId) {
  const result = await client.query(
    `SELECT id, name, credit_hold, state, created_at, updated_at FROM farms WHERE id = $1`,
    [farmId]
  );
  return result.rows[0] || null;
}

async function createFarm(client, { id, name, creditHold, state }) {
  const result = await client.query(
    `INSERT INTO farms (id, name, credit_hold, state, source)
     VALUES ($1, $2, $3, $4, 'api')
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       credit_hold = EXCLUDED.credit_hold,
       state = EXCLUDED.state,
       updated_at = NOW()
     WHERE farms.source = 'import'
     RETURNING id`,
    [id, name, creditHold, state]
  );
  return result.rows[0] || null;
}

async function updateFarm(client, id, { name, creditHold, state }) {
  const result = await client.query(
    `UPDATE farms SET name = $2, credit_hold = $3, state = $4, updated_at = NOW()
     WHERE id = $1 AND source = 'api'
     RETURNING id`,
    [id, name, creditHold, state]
  );
  return result.rows[0] || null;
}

async function deleteFarm(client, id) {
  const result = await client.query(
    `DELETE FROM farms WHERE id = $1 AND source = 'api'
     RETURNING id`,
    [id]
  );
  return result.rows[0] || null;
}

module.exports = { listFarms, findFarmById, createFarm, updateFarm, deleteFarm };