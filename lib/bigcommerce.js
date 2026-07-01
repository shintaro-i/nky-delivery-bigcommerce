const axios = require('axios');

const STORE_HASH = process.env.BIGCOMMERCE_STORE_HASH;
const ACCESS_TOKEN = process.env.BIGCOMMERCE_ACCESS_TOKEN;

if (!STORE_HASH || !ACCESS_TOKEN) {
  console.warn(
    'Warning: BIGCOMMERCE_STORE_HASH or BIGCOMMERCE_ACCESS_TOKEN is not set. BigCommerce API calls will fail.'
  );
}

const commonHeaders = {
  'X-Auth-Token': ACCESS_TOKEN,
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

const client = axios.create({
  baseURL: `https://api.bigcommerce.com/stores/${STORE_HASH}/v3`,
  headers: commonHeaders,
  timeout: 10000,
});

// Orders still live under the v2 API.
const clientV2 = axios.create({
  baseURL: `https://api.bigcommerce.com/stores/${STORE_HASH}/v2`,
  headers: commonHeaders,
  timeout: 10000,
});

/**
 * Fetch products by id and return a map keyed by product id containing
 * the price and the `shipping_type` custom field value.
 *
 * @param {number[]} ids
 * @returns {Promise<Object<number, {id:number, name:string, price:number, shippingType:string|null}>>}
 */
async function getProductsByIds(ids) {
  const uniqueIds = [...new Set(ids.map(Number).filter(Boolean))];
  if (uniqueIds.length === 0) return {};

  const [{ data }, taxInclusivePrices] = await Promise.all([
    client.get('/catalog/products', {
      params: {
        'id:in': uniqueIds.join(','),
        include: 'custom_fields',
        limit: 250,
      },
    }),
    getTaxInclusivePrices(uniqueIds),
  ]);

  const result = {};
  for (const p of data.data) {
    const cf = (p.custom_fields || []).find((c) => c.name === 'shipping_type');
    result[p.id] = {
      id: p.id,
      name: p.name,
      // Free-shipping thresholds are judged on tax-inclusive prices, so prefer
      // the Pricing API value and fall back to the catalog price.
      price: taxInclusivePrices[p.id] != null ? taxInclusivePrices[p.id] : p.price,
      shippingType: cf ? cf.value : null,
    };
  }
  return result;
}

/**
 * Fetch tax-inclusive unit prices for the given product ids via the Pricing API.
 * Returns a map of productId -> tax-inclusive price. On failure returns {} so
 * callers can fall back to the catalog price.
 * @param {number[]} ids
 */
async function getTaxInclusivePrices(ids) {
  try {
    const { data } = await client.post('/pricing/products', {
      channel_id: 1,
      currency_code: 'JPY',
      items: ids.map((id) => ({ product_id: id })),
    });
    const map = {};
    for (const item of data.data || []) {
      const price = item.price && item.price.tax_inclusive;
      if (price != null) map[item.product_id] = price;
    }
    return map;
  } catch (error) {
    console.warn('Pricing API failed, falling back to catalog price:', error.message);
    return {};
  }
}

/**
 * List products with their price and `shipping_type` custom field value.
 * Intended for populating a storefront / picker UI.
 *
 * @param {{limit?:number, page?:number}} [opts]
 * @returns {Promise<{products:Array, pagination:object}>}
 */
async function listProducts({ limit = 50, page = 1 } = {}) {
  const { data } = await client.get('/catalog/products', {
    params: { include: 'custom_fields,images', limit, page, is_visible: true },
  });

  const products = data.data.map((p) => {
    const cf = (p.custom_fields || []).find((c) => c.name === 'shipping_type');
    const image =
      (p.images || []).find((img) => img.is_thumbnail) || (p.images || [])[0];
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

/**
 * Fetch a single product's full detail for a product page: description, images
 * gallery, tax-inclusive price, and shipping_type. Returns null if not found.
 * @param {number|string} id
 */
async function getProductDetail(id) {
  let product;
  try {
    const { data } = await client.get(`/catalog/products/${id}`, {
      params: { include: 'custom_fields,images' },
    });
    product = data.data;
  } catch (error) {
    if (error.response && error.response.status === 404) return null;
    throw error;
  }

  const cf = (product.custom_fields || []).find(
    (c) => c.name === 'shipping_type'
  );
  const taxInclusive = await getTaxInclusivePrices([product.id]);

  const images = (product.images || [])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((img) => ({
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

/**
 * Fetch a single order. Returns null if it does not exist (v2 returns 404).
 * @param {number|string} orderId
 */
async function getOrder(orderId) {
  try {
    const { data } = await clientV2.get(`/orders/${orderId}`);
    return data;
  } catch (error) {
    if (error.response && error.response.status === 404) return null;
    throw error;
  }
}

/**
 * Fetch the shipping destinations (consignments) for an order. An order with
 * multiple delivery addresses returns one entry per destination.
 * @param {number|string} orderId
 */
async function getOrderShippingAddresses(orderId) {
  const { data } = await clientV2.get(`/orders/${orderId}/shipping_addresses`);
  return data || [];
}

/**
 * Fetch the line items of an order. Each product carries an order_address_id
 * linking it to one of the shipping addresses above.
 * @param {number|string} orderId
 */
async function getOrderProducts(orderId) {
  const { data } = await clientV2.get(`/orders/${orderId}/products`);
  return data || [];
}

module.exports = {
  client,
  clientV2,
  getProductsByIds,
  listProducts,
  getProductDetail,
  getOrder,
  getOrderShippingAddresses,
  getOrderProducts,
};
