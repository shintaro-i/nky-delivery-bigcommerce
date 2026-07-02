/**
 * 「セレクト商品」カテゴリー(手動キュレーション)を割り当てるスクリプト。
 * 対象商品リストは Shopify のコレクション所属を手入力。
 * 既存カテゴリー(温度帯など)は保持したまま「セレクト商品」を追加する。
 *
 * 使い方:
 *   node scripts/assign-select-category.js            … ドライラン
 *   node scripts/assign-select-category.js --commit   … 実行
 */
require('dotenv').config({ path: ['.env.local', '.env'] });
const { client } = require('../lib/bigcommerce');

const COMMIT = process.argv.includes('--commit');
const SELECT_CATEGORY_NAME = 'セレクト商品';

// Shopify「セレクト商品」コレクションの商品(重複除去済み)
const SELECT_PRODUCTS = [
  '【楽食彩】ゆば・鶏・根菜の黒酢あん　(冷凍)',
  '【楽食彩】細巻きゆばの含め煮　(冷凍)',
  '【楽食彩】だしが決め手のゆば煮付け　(冷凍)',
  '生麩（冷凍）',
  '極上おさしみ用生ゆば（冷凍）',
  '日光ゆばと有明産海苔のお吸い物　8コ入',
  '日光とろゆば（冷凍）',
  '揚巻ゆば（M） 10コ入（冷凍）',
  '味付巻ゆば 6コ入（冷凍）',
  '味付ぜんまいゆば（冷凍）',
  'ゆば飛龍頭(大)　10コ入（冷凍）',
  'ゆば豆富ナゲット　10コ入（冷凍）',
  'ゆば胡麻和え（冷凍）',
  'ゆばめしのもと（ゆばあんかけ）単品（冷凍）',
  'ゆばと野菜の豆富バーグ　5コ入（冷凍）',
  'ゆばと野菜のふんわり豆富　8コ入（冷凍）',
  'たぐりゆば （特小）10コ入（冷凍）',
  'おさしみ用生ゆば（冷凍）',
];

async function getSelectCategoryId() {
  const { data } = await client.get('/catalog/categories', { params: { limit: 250 } });
  const cat = data.data.find((c) => c.name === SELECT_CATEGORY_NAME);
  if (!cat) throw new Error(`カテゴリー「${SELECT_CATEGORY_NAME}」が見つかりません`);
  return cat.id;
}

async function fetchProducts() {
  const map = new Map();
  let page = 1;
  for (;;) {
    const { data } = await client.get('/catalog/products', {
      params: { limit: 250, page, include_fields: 'name,categories' },
    });
    for (const p of data.data) map.set(p.name, { id: p.id, categories: p.categories || [] });
    if (page >= data.meta.pagination.total_pages) break;
    page++;
  }
  return map;
}

async function main() {
  const selectId = await getSelectCategoryId();
  const products = await fetchProducts();
  console.log(`セレクト商品カテゴリー id=${selectId}`);

  const plan = [];
  const missing = [];
  for (const name of SELECT_PRODUCTS) {
    const p = products.get(name);
    if (!p) {
      missing.push(name);
      continue;
    }
    const next = Array.from(new Set([...p.categories, selectId]));
    plan.push({ name, id: p.id, before: p.categories, after: next });
  }

  console.log(`\n=== 割り当て計画 ===`);
  console.log(`対象: ${SELECT_PRODUCTS.length} / マッチ: ${plan.length} / 未検出: ${missing.length}`);
  for (const x of plan) console.log(`  ${x.name} (id=${x.id}) categories ${JSON.stringify(x.before)} -> ${JSON.stringify(x.after)}`);
  if (missing.length) console.log(`\n未検出(名前不一致): ${missing.join(', ')}`);

  if (!COMMIT) {
    console.log(`\n[ドライラン] --commit で実行します。`);
    return;
  }

  console.log(`\n=== 実行 ===`);
  let ok = 0;
  for (const x of plan) {
    try {
      await client.put(`/catalog/products/${x.id}`, { categories: x.after });
      ok++;
    } catch (e) {
      console.error(`error: ${x.name} (HTTP ${e.response && e.response.status})`);
    }
  }
  console.log(`\n完了: ${ok}/${plan.length} 件に「セレクト商品」を追加`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
