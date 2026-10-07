const { Router } = require('express');
const { withTransaction } = require('../db/pool');
const productsRepo = require('../repositories/productsRepo');
const { AppError } = require('../errors');

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const products = await withTransaction(async client => productsRepo.listProducts(client));
    res.json({ items: products });
  } catch (err) {
    next(err);
  }
});

router.get('/:code', async (req, res, next) => {
  try {
    const product = await withTransaction(async client => productsRepo.findProductByCode(client, req.params.code));
    if (!product) throw new AppError('NOT_FOUND', `Product ${req.params.code} not found`);
    const labels = await withTransaction(async client => productsRepo.getLabelsForProduct(client, req.params.code));
    res.json({ ...product, labels });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { code, description, active, unit_price, stock_available, stock_reserved, labels } = req.body;
    if (!code || !description) throw new AppError('VALIDATION_ERROR', 'code and description are required');
    const result = await withTransaction(async client => {
      const product = await productsRepo.createProduct(client, {
        code: code.trim().toUpperCase(),
        description: description.trim(),
        active: active !== undefined ? !!active : true,
        unitPrice: unit_price || 0,
        stockAvailable: stock_available || 0,
        stockReserved: stock_reserved || 0,
      });
      if (labels && labels.length > 0) {
        await productsRepo.replaceProductLabels(client, product.code, labels);
      }
      return product;
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.put('/:code', async (req, res, next) => {
  try {
    const { description, active, unit_price, stock_available, stock_reserved, labels } = req.body;
    if (!description) throw new AppError('VALIDATION_ERROR', 'description is required');
    const result = await withTransaction(async client => {
      const product = await productsRepo.updateProduct(client, req.params.code, {
        description: description.trim(),
        active: active !== undefined ? !!active : true,
        unitPrice: unit_price || 0,
        stockAvailable: stock_available || 0,
        stockReserved: stock_reserved || 0,
      });
      if (!product) throw new AppError('NOT_FOUND', `Product ${req.params.code} not found or not editable`);
      if (labels !== undefined) {
        await productsRepo.replaceProductLabels(client, req.params.code, labels);
      }
      return product;
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.delete('/:code', async (req, res, next) => {
  try {
    const result = await withTransaction(async client => productsRepo.deleteProduct(client, req.params.code));
    if (!result) throw new AppError('NOT_FOUND', `Product ${req.params.code} not found or not deletable`);
    res.json({ deleted: result.code });
  } catch (err) {
    next(err);
  }
});

module.exports = router;