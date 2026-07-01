const express = require('express');
const { listCategories } = require('../../lib/bigcommerce');

const router = express.Router();

/**
 * GET /api/categories
 * Returns visible categories for storefront navigation.
 */
router.get('/', async (req, res) => {
  try {
    const categories = await listCategories();
    res.json({ categories });
  } catch (error) {
    console.error('Category list error:', error.message);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

module.exports = router;
