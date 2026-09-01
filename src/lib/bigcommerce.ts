// BigCommerce API クライアント(fetch版)。Express版 lib/bigcommerce.js の移植。
// Workers では env がリクエストごとに渡るため、createBc(env) で env を束ねて返す。
import type { Env } from "../env";

export class BcError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Params = Record<string, string | number | boolean | undefined>;

function buildQuery(params?: Params): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function createBc(env: Env) {
  const STORE_HASH = env.BIGCOMMERCE_STORE_HASH;
  const ACCESS_TOKEN = env.BIGCOMMERCE_ACCESS_TOKEN;
  const CONTENT_TOKEN = env.BIGCOMMERCE_CONTENT_TOKEN || ACCESS_TOKEN;
  const V3 = `https://api.bigcommerce.com/stores/${STORE_HASH}/v3`;
  const V2 = `https://api.bigcommerce.com/stores/${STORE_HASH}/v2`;

  async function req(
    base: string,
    path: string,
    opts: { method?: string; params?: Params; body?: unknown; token?: string } = {}
  ): Promise<any> {
    const { method = "GET", params, body, token = ACCESS_TOKEN } = opts;
    const res = await fetch(`${base}${path}${buildQuery(params)}`, {
      method,
      headers: {
        "X-Auth-Token": token,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: body != null ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      throw new BcError(res.status, `BigCommerce ${method} ${path} -> ${res.status}`);
    }
    // v2 の一部は空ボディ(204)を返すことがある
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  /** 商品idからタックスインクルーシブ単価を取得。失敗時は {} を返しカタログ価格にフォールバック。 */
  async function getTaxInclusivePrices(ids: number[]): Promise<Record<number, number>> {
    try {
      const data = await req(V3, "/pricing/products", {
        method: "POST",
        body: {
          channel_id: 1,
          currency_code: "JPY",
          items: ids.map((id) => ({ product_id: id })),
        },
      });
      const map: Record<number, number> = {};
      for (const item of data?.data || []) {
        const price = item.price && item.price.tax_inclusive;
        if (price != null) map[item.product_id] = price;
      }
      return map;
    } catch (e) {
      console.warn("Pricing API failed, falling back to catalog price:", (e as Error).message);
      return {};
    }
  }

  async function getProductsByIds(ids: number[]) {
    const uniqueIds = [...new Set(ids.map(Number).filter(Boolean))];
    if (uniqueIds.length === 0) return {} as Record<number, any>;

    const [data, taxInclusivePrices] = await Promise.all([
      req(V3, "/catalog/products", {
        params: { "id:in": uniqueIds.join(","), include: "custom_fields", limit: 250 },
      }),
      getTaxInclusivePrices(uniqueIds),
    ]);

    const result: Record<number, any> = {};
    for (const p of data.data) {
      const cf = (p.custom_fields || []).find((c: any) => c.name === "shipping_type");
      result[p.id] = {
        id: p.id,
        name: p.name,
        // 送料無料の判定は税込価格で行うため Pricing API 優先、無ければカタログ価格。
        price: taxInclusivePrices[p.id] != null ? taxInclusivePrices[p.id] : p.price,
        shippingType: cf ? cf.value : null,
      };
    }
    return result;
  }

  async function listCategories() {
    const data = await req(V3, "/catalog/categories", {
      params: { limit: 250, is_visible: true },
    });
    return (data.data as any[])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => ({
        id: c.id,
        name: c.name,
        parentId: c.parent_id,
        description: c.description || "",
      }));
  }

  async function listProducts(opts: {
    limit?: number; page?: number; categoryId?: number; keyword?: string;
  } = {}) {
    const { limit = 50, page = 1, categoryId, keyword } = opts;
    const params: Params = { include: "custom_fields,images", limit, page, is_visible: true };
    if (categoryId) params["categories:in"] = categoryId;
    if (keyword) params.keyword = keyword;

    const data = await req(V3, "/catalog/products", { params });

    const products = (data.data as any[]).map((p) => {
      const cf = (p.custom_fields || []).find((c: any) => c.name === "shipping_type");
      const image =
        (p.images || []).find((img: any) => img.is_thumbnail) || (p.images || [])[0];
      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        price: p.price,
        shippingType: cf ? cf.value : null,
        imageUrl: image ? image.url_standard : null,
      };
    });

    return { products, pagination: data.meta.pagination };
  }

  async function getInventory(ids: number[]) {
    const unique = [...new Set(ids.map(Number).filter(Boolean))];
    if (unique.length === 0) return {} as Record<number, any>;
    const data = await req(V3, "/catalog/products", {
      params: {
        "id:in": unique.join(","),
        include_fields: "inventory_tracking,inventory_level",
        limit: 250,
      },
    });
    const map: Record<number, any> = {};
    for (const p of data.data) {
      map[p.id] = { tracking: p.inventory_tracking, level: p.inventory_level };
    }
    return map;
  }

  async function getProductDetail(id: string | number) {
    let product: any;
    try {
      const data = await req(V3, `/catalog/products/${id}`, {
        params: { include: "custom_fields,images" },
      });
      product = data.data;
    } catch (error) {
      if (error instanceof BcError && error.status === 404) return null;
      throw error;
    }

    const cf = (product.custom_fields || []).find((c: any) => c.name === "shipping_type");
    const taxInclusive = await getTaxInclusivePrices([product.id]);

    const images = (product.images || [])
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((img: any) => ({
        url: img.url_standard,
        thumbnail: img.url_thumbnail,
        isThumbnail: img.is_thumbnail,
        alt: img.description || product.name,
      }));

    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      price: taxInclusive[product.id] != null ? taxInclusive[product.id] : product.price,
      description: product.description || "",
      availability: product.availability,
      shippingType: cf ? cf.value : null,
      images,
      imageUrl: images.length ? images[0].url : null,
    };
  }

  async function getBlogPosts(limit = 10) {
    // Content スコープが必要。専用トークン(CONTENT_TOKEN)を使用。
    const data = await req(V2, "/blog/posts", {
      params: { is_published: true, limit },
      token: CONTENT_TOKEN,
    });
    return ((data as any[]) || []).map((p) => ({
      id: p.id,
      title: p.title,
      body: p.body || "",
      summary: p.summary || "",
      publishedAt:
        p.published_date_iso8601 || (p.published_date && p.published_date.date) || null,
      url: p.url,
    }));
  }

  async function getOrder(orderId: string | number) {
    try {
      return await req(V2, `/orders/${orderId}`);
    } catch (error) {
      if (error instanceof BcError && error.status === 404) return null;
      throw error;
    }
  }

  async function getOrderShippingAddresses(orderId: string | number) {
    const data = await req(V2, `/orders/${orderId}/shipping_addresses`);
    return data || [];
  }

  async function getOrderProducts(orderId: string | number) {
    const data = await req(V2, `/orders/${orderId}/products`);
    return data || [];
  }

  return {
    getProductsByIds,
    listProducts,
    listCategories,
    getProductDetail,
    getInventory,
    getBlogPosts,
    getOrder,
    getOrderShippingAddresses,
    getOrderProducts,
  };
}
