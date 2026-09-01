import { Hono } from "hono";
import type { Env } from "../env";
import { createBc } from "../lib/bigcommerce";
import {
  calculateDestinationShipping,
  getRegionFromPrefecture,
  type ShippingItem,
} from "../lib/shipping";

const app = new Hono<{ Bindings: Env }>();

type ReqItem = {
  productId?: number;
  quantity?: number;
  shippingType?: string | null;
  totalPrice?: number;
};
type ReqDest = {
  id?: string;
  items?: ReqItem[];
  region?: string;
  prefecture?: string;
};

// BigCommerce 参照商品のidを全宛先から収集(1回でまとめて取得するため)。
function collectProductIds(destinations: ReqDest[]): number[] {
  const ids: number[] = [];
  for (const dest of destinations) {
    for (const item of dest.items || []) {
      if (item.productId != null && item.shippingType == null) ids.push(item.productId);
    }
  }
  return ids;
}

// リクエスト item を計算用の形へ。shippingType/totalPrice を直接持つか、
// productId 参照ならカタログから解決する。
function resolveItems(items: ReqItem[], productMap: Record<number, any>): ShippingItem[] {
  return items.map((item) => {
    if (item.shippingType != null) {
      return { shippingType: item.shippingType, totalPrice: item.totalPrice || 0 };
    }
    const product = productMap[item.productId as number];
    if (!product) throw new Error(`Product not found: ${item.productId}`);
    if (!product.shippingType) {
      throw new Error(`Product ${item.productId} has no shipping_type custom field`);
    }
    const quantity = item.quantity || 1;
    return { shippingType: product.shippingType, totalPrice: product.price * quantity };
  });
}

app.post("/", async (c) => {
  try {
    const body = await c.req.json<{ destinations?: ReqDest[] }>();
    const destinations = body.destinations;

    if (!destinations || !Array.isArray(destinations)) {
      return c.json({ error: "destinations array is required" }, 400);
    }

    for (const dest of destinations) {
      if (!dest.items) {
        return c.json({ error: "Each destination must have items" }, 400);
      }
      if (!dest.region) {
        if (!dest.prefecture) {
          return c.json({ error: "Each destination must have region or prefecture" }, 400);
        }
        const region = getRegionFromPrefecture(dest.prefecture);
        if (!region) {
          return c.json({ error: `Unknown prefecture: ${dest.prefecture}` }, 400);
        }
        dest.region = region;
      }
    }

    const productIds = collectProductIds(destinations);
    const bc = createBc(c.env);
    const productMap = productIds.length ? await bc.getProductsByIds(productIds) : {};

    let totalShipping = 0;
    const breakdown: any[] = [];

    for (const dest of destinations) {
      const items = resolveItems(dest.items as ReqItem[], productMap);
      const shipping = calculateDestinationShipping(items, dest.region as any);
      totalShipping += shipping;
      breakdown.push({
        destinationId: dest.id,
        ...(dest.prefecture ? { prefecture: dest.prefecture } : {}),
        region: dest.region,
        shipping,
      });
    }

    return c.json({ total: totalShipping, breakdown });
  } catch (error) {
    const msg = (error as Error).message;
    console.error("Shipping calculation error:", msg);
    if (/Product (not found|\d+ has no shipping_type)/.test(msg)) {
      return c.json({ error: msg }, 400);
    }
    return c.json({ error: "Shipping calculation failed" }, 500);
  }
});

export default app;
