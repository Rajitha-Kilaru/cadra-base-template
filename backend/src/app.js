require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { errorHandler, notFoundHandler } = require('./errors');
const orderRoutes = require('./routes/orders');
const farmRoutes = require('./routes/farms');
const productRoutes = require('./routes/products');

const app = express();

const corsOrigin = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: corsOrigin.length > 0 ? corsOrigin : '*',
  credentials: true,
}));

app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Routes
app.use('/api/orders', orderRoutes);
app.use('/api/farms', farmRoutes);
app.use('/api/products', productRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;