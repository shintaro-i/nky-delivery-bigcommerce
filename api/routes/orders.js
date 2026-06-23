const express = require('express');
const {
  calculateDestinationShipping,
  getRegionFromPrefecture,
} = require('../../lib/shipping');
const {
  getOrder,
  getOrderShippingAddresses,
  getOrderProducts,
  getProductsByIds,
} = require('../../lib/bigcommerce');

const router = express.Router();

/**
 * GET /api/orders/:orderId/shipping
 * Recomputes the multi-destination shipping for an existing BigCommerce order:
 * groups line items by shipping address, resolves each product's shipping_type
 * from the catalog, and runs the region/temperature shipping rules.
 */
router.get('/:orderId/shipping', async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await getOrder(orderId);
    if (!order) {
      return res.status(404).json({ error: `Order not found: ${orderId}` });
    }

    const [shippingAddresses, orderProducts] = await Promise.all([
      getOrderShippingAddresses(orderId),
      getOrderProducts(orderId),
    ]);

    // Resolve shipping_type for every catalog product referenced by the order.
    const catalogIds = orderProducts
      .map((p) => p.product_id)
      .filter((id) => id);
    const productMap = catalogIds.length ? await getProductsByIds(catalogIds) : {};

    // Group line items by their shipping address (order_address_id).
    const itemsByAddress = {};
    for (const p of orderProducts) {
      const addrId = p.order_address_id;
      if (!itemsByAddress[addrId]) itemsByAddress[addrId] = [];
      const catalog = productMap[p.product_id];
      itemsByAddress[addrId].push({
        shippingType: catalog ? catalog.shippingType : null,
        totalPrice: parseFloat(p.total_inc_tax) || 0,
      });
    }

    let totalShipping = 0;
    const breakdown = [];

    for (const addr of shippingAddresses) {
      const items = itemsByAddress[addr.id] || [];
      const prefecture = addr.state; // BigCommerce stores the prefecture in `state`
      const region = getRegionFromPrefecture(prefecture);

      let shipping = 0;
      let note;
      if (!region) {
        note = `Unknown prefecture: ${prefecture}`;
      } else if (items.some((i) => !i.shippingType)) {
        note = 'Some items have no shipping_type custom field';
        shipping = calculateDestinationShipping(
          items.filter((i) => i.shippingType),
          region
        );
      } else {
        shipping = calculateDestinationShipping(items, region);
      }

      totalShipping += shipping;
      breakdown.push({
        addressId: addr.id,
        prefecture,
        region,
        itemCount: items.length,
        shipping,
        ...(note ? { note } : {}),
      });
    }

    res.json({
      orderId: Number(orderId),
      total: totalShipping,
      breakdown,
    });
  } catch (error) {
    console.error('Order shipping error:', error.message);
    res.status(500).json({ error: 'Failed to compute order shipping' });
  }
});

module.exports = router;
