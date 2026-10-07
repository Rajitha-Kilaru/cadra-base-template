const { Router } = require('express');
const { withTransaction } = require('../db/pool');
const farmsRepo = require('../repositories/farmsRepo');
const { AppError } = require('../errors');

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const farms = await withTransaction(async client => farmsRepo.listFarms(client));
    res.json({ items: farms });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const farm = await withTransaction(async client => farmsRepo.findFarmById(client, req.params.id));
    if (!farm) throw new AppError('NOT_FOUND', `Farm ${req.params.id} not found`);
    res.json(farm);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { id, name, credit_hold, state } = req.body;
    if (!id || !name) throw new AppError('VALIDATION_ERROR', 'id and name are required');
    const farmId = id.trim().toUpperCase();
    const result = await withTransaction(async client => farmsRepo.createFarm(client, {
      id: farmId, name: name.trim(), creditHold: !!credit_hold, state: state || null,
    }));
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, credit_hold, state } = req.body;
    if (!name) throw new AppError('VALIDATION_ERROR', 'name is required');
    const result = await withTransaction(async client => farmsRepo.updateFarm(client, req.params.id, {
      name: name.trim(), creditHold: !!credit_hold, state: state || null,
    }));
    if (!result) throw new AppError('NOT_FOUND', `Farm ${req.params.id} not found or not editable`);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await withTransaction(async client => farmsRepo.deleteFarm(client, req.params.id));
    if (!result) throw new AppError('NOT_FOUND', `Farm ${req.params.id} not found or not deletable`);
    res.json({ deleted: result.id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;