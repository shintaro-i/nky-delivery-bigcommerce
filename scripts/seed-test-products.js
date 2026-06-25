/**
 * テスト用商品の登録スクリプト。
 *
 * 送料計算で扱う shipping_type のうち、まだストアに無い区分の商品を作成します。
 * BigCommerce の Access Token に「Products: modify(read/write)」スコープが必要です。
 *
 * 実行: node scripts/seed-test-products.js
 *
 * 既に同名の商品があればスキップします（重複作成しません）。
 */
require('dotenv').config({ path: ['.env.local', '.env'] });
const { client } = require('../lib/bigcommerce');

// 価格は税込（ストアが entered_inclusive 設定のため）。必要に応じて調整してください。
const TEST_PRODUCTS = [
  { name: 'お吸い物商品D', price: 2000, shippingType: 'osuimono' },
  { name: '送料無料冷蔵商品E', price: 5000, shippingType: 'free_reizo' },
  { name: '送料無料冷凍商品F', price: 5000, shippingType: 'free_reito' },
];

async function findProductByName(name) {
  const { data } = await client.get('/catalog/products', {
    params: { 'name:like': name, limit: 1 },
  });
  return data.data.find((p) => p.name === name) || null;
}

async function createProduct({ name, price, shippingType }) {
  const { data } = await client.post('/catalog/products', {
    name,
    type: 'physical',
    weight: 1,
    price,
    custom_fields: [{ name: 'shipping_type', value: shippingType }],
  });
  return data.data;
}

async function main() {
  for (const spec of TEST_PRODUCTS) {
    try {
      const existing = await findProductByName(spec.name);
      if (existing) {
        console.log(`skip : ${spec.name} は既に存在 (id=${existing.id})`);
        continue;
      }
      const created = await createProduct(spec);
      console.log(
        `created: ${created.name} (id=${created.id}, shipping_type=${spec.shippingType}, price=${spec.price})`
      );
    } catch (error) {
      const status = error.response && error.response.status;
      const detail = error.response && error.response.data;
      console.error(
        `error: ${spec.name} の作成に失敗 (HTTP ${status})`,
        detail ? JSON.stringify(detail) : error.message
      );
      if (status === 403) {
        console.error(
          '→ トークンに Products の書き込み権限がありません。管理画面で modify スコープのトークンを発行してください。'
        );
        process.exit(1);
      }
    }
  }
  console.log('完了');
}

main();
