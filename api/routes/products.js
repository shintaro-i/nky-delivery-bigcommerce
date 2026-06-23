const express = require('express');
const { listProducts } = require('../../lib/bigcommerce');

const router = express.Router();

/**
 * GET /api/products?limit=&page=
 * Returns visible products with their price and shipping_type.
 */
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 250);
    const page = parseInt(req.query.page, 10) || 1;

    const { products, pagination } = await listProducts({ limit, page });
    res.json({ products, pagination });
  } catch (error) {
    console.error('Product list error:', error.message);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

module.exports = router;
