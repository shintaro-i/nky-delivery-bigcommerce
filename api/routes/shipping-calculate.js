const express = require('express');
const {
  calculateDestinationShipping,
  getRegionFromPrefecture,
} = require('../../lib/shipping');
const { getProductsByIds } = require('../../lib/bigcommerce');

const router = express.Router();

/**
 * Collect every productId referenced across all destinations so we can fetch
 * them from BigCommerce in a single request.
 */
function collectProductIds(destinations) {
  const ids = [];
  for (const dest of destinations) {
    for (const item of dest.items || []) {
      if (item.productId != null && item.shippingType == null) {
        ids.push(item.productId);
      }
    }
  }
  return ids;
}

/**
 * Turn raw request items into the shape expected by calculateDestinationShipping.
 * An item may either carry { shippingType, totalPrice } directly, or reference a
 * BigCommerce product via { productId, quantity } — in which case shippingType
 * and price are resolved from the catalog.
 */
function resolveItems(items, productMap) {
  return items.map((item) => {
    if (item.shippingType != null) {
      return { shippingType: item.shippingType, totalPrice: item.totalPrice || 0 };
    }

    const product = productMap[item.productId];
    if (!product) {
      throw new Error(`Product not found: ${item.productId}`);
    }
    if (!product.shippingType) {
      throw new Error(`Product ${item.productId} has no shipping_type custom field`);
    }

    const quantity = item.quantity || 1;
    return {
      shippingType: product.shippingType,
      totalPrice: product.price * quantity,
    };
  });
}

router.post('/', async (req, res) => {
  try {
    const { destinations } = req.body;

    if (!destinations || !Array.isArray(destinations)) {
      return res.status(400).json({
        error: 'destinations array is required',
      });
    }

    // Each destination needs items plus either a region key or a prefecture
    // name (which we resolve to a region).
    for (const dest of destinations) {
      if (!dest.items) {
        return res.status(400).json({
          error: 'Each destination must have items',
        });
      }
      if (!dest.region) {
        if (!dest.prefecture) {
          return res.status(400).json({
            error: 'Each destination must have region or prefecture',
          });
        }
        dest.region = getRegionFromPrefecture(dest.prefecture);
        if (!dest.region) {
          return res.status(400).json({
            error: `Unknown prefecture: ${dest.prefecture}`,
          });
        }
      }
    }

    // Fetch any BigCommerce-referenced products up front in one call.
    const productIds = collectProductIds(destinations);
    const productMap = productIds.length ? await getProductsByIds(productIds) : {};

    let totalShipping = 0;
    const breakdown = [];

    for (const dest of destinations) {
      const items = resolveItems(dest.items, productMap);
      const shipping = calculateDestinationShipping(items, dest.region);
      totalShipping += shipping;

      breakdown.push({
        destinationId: dest.id,
        ...(dest.prefecture ? { prefecture: dest.prefecture } : {}),
        region: dest.region,
        shipping,
      });
    }

    res.json({
      total: totalShipping,
      breakdown,
    });
  } catch (error) {
    console.error('Shipping calculation error:', error.message);
    if (/Product (not found|\d+ has no shipping_type)/.test(error.message)) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Shipping calculation failed' });
  }
});

module.exports = router;
