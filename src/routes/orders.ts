import { Hono } from "hono";
import type { Env } from "../env";
import { createBc } from "../lib/bigcommerce";
import {
  calculateDestinationShipping,
  getRegionFromPrefecture,
  type ShippingItem,
} from "../lib/shipping";

const app = new Hono<{ Bindings: Env }>();

// GET /api/orders/:orderId/shipping
// 既存注文の複数宛先送料を再計算(宛先ごとに商品をまとめ、shipping_type を解決)。
app.get("/:orderId/shipping", async (c) => {
  try {
    const orderId = c.req.param("orderId");
    const bc = createBc(c.env);

    const order = await bc.getOrder(orderId);
    if (!order) return c.json({ error: `Order not found: ${orderId}` }, 404);

    const [shippingAddresses, orderProducts] = await Promise.all([
      bc.getOrderShippingAddresses(orderId),
      bc.getOrderProducts(orderId),
    ]);

    const catalogIds = (orderProducts as any[]).map((p) => p.product_id).filter((id) => id);
    const productMap = catalogIds.length ? await bc.getProductsByIds(catalogIds) : {};

    const itemsByAddress: Record<string, ShippingItem[]> = {};
    for (const p of orderProducts as any[]) {
      const addrId = p.order_address_id;
      if (!itemsByAddress[addrId]) itemsByAddress[addrId] = [];
      const catalog = productMap[p.product_id];
      itemsByAddress[addrId].push({
        shippingType: catalog ? catalog.shippingType : null,
        totalPrice: parseFloat(p.total_inc_tax) || 0,
      });
    }

    let totalShipping = 0;
    const breakdown: any[] = [];

    for (const addr of shippingAddresses as any[]) {
      const items = itemsByAddress[addr.id] || [];
      const prefecture = addr.state; // BigCommerce は state に都道府県を保存
      const region = getRegionFromPrefecture(prefecture);

      let shipping = 0;
      let note: string | undefined;
      if (!region) {
        note = `Unknown prefecture: ${prefecture}`;
      } else if (items.some((i) => !i.shippingType)) {
        note = "Some items have no shipping_type custom field";
        shipping = calculateDestinationShipping(items.filter((i) => i.shippingType), region);
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

    return c.json({ orderId: Number(orderId), total: totalShipping, breakdown });
  } catch (error) {
    console.error("Order shipping error:", (error as Error).message);
    return c.json({ error: "Failed to compute order shipping" }, 500);
  }
});

export default app;
