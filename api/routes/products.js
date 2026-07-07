const express = require('express');
const { listProducts, getProductDetail, getInventory } = require('../../lib/bigcommerce');

const router = express.Router();

/**
 * GET /api/products/inventory?ids=1,2,3
 * Returns inventory tracking/level per product for stock validation.
 * NOTE: must be declared before '/:id'.
 */
router.get('/inventory', async (req, res) => {
  try {
    const ids = String(req.query.ids || '')
      .split(',')
      .map((s) => parseInt(s, 10))
      .filter(Boolean);
    const inventory = await getInventory(ids);
    res.json({ inventory });
  } catch (error) {
    console.error('Inventory error:', error.message);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

/**
 * GET /api/products?limit=&page=
 * Returns visible products with their price and shipping_type.
 */
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 250);
    const page = parseInt(req.query.page, 10) || 1;
    const categoryId = parseInt(req.query.categoryId, 10) || undefined;
    const keyword = req.query.keyword ? String(req.query.keyword) : undefined;

    const { products, pagination } = await listProducts({ limit, page, categoryId, keyword });
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
