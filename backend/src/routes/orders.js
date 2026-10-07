// routes/orders.js — thin HTTP layer only.
const { Router } = require('express');
const orderService = require('../services/orderService');
const { listQuery, parseOr400 } = require('../validation/schemas');
const { AppError } = require('../errors');

const router = Router();

// GET /api/orders
router.get('/', async (req, res, next) => {
  try {
    let data;
    try {
      data = parseOr400(listQuery, req.query);
    } catch (e) {
      // Pass validation error through
      throw e;
    }
    const result = await orderService.listOrders(data);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:order_id
router.get('/:order_id', async (req, res, next) => {
  try {
    const result = await orderService.getOrder(req.params.order_id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/orders
router.post('/', async (req, res, next) => {
  try {
    const { order, created } = await orderService.createOrder(req.body);
    res.status(created ? 201 : 200).json(order);
  } catch (err) {
    next(err);
  }
});

// POST /api/orders/:order_id/lines
router.post('/:order_id/lines', async (req, res, next) => {
  try {
    const order = await orderService.addLine(req.params.order_id, req.body);
    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
});

// POST /api/orders/:order_id/transition
router.post('/:order_id/transition', async (req, res, next) => {
  try {
    const order = await orderService.transitionOrder(req.params.order_id, req.body);
    res.status(200).json(order);
  } catch (err) {
    next(err);
  }
});

// POST /api/orders/:order_id/notes
router.post('/:order_id/notes', async (req, res, next) => {
  try {
    const order = await orderService.addNote(req.params.order_id, req.body);
    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
});

module.exports = router;