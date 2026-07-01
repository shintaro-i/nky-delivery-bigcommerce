const express = require('express');
const { listProducts, getProductDetail } = require('../../lib/bigcommerce');

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

/**
 * GET /api/products/:id
 * Returns a single product's full detail (description, images, tax-inclusive
 * price, shipping_type).
 */
router.get('/:id', async (req, res) => {
  try {
    const product = await getProductDetail(req.params.id);
    if (!product) {
      return res.status(404).json({ error: `Product not found: ${req.params.id}` });
    }
    res.json({ product });
  } catch (error) {
    console.error('Product detail error:', error.message);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

module.exports = router;
