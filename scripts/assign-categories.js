/**
 * Shopify のコレクション構成に合わせて BigCommerce のカテゴリーを作成し、
 * 商品を割り当てるスクリプト。
 *
 * 使い方:
 *   node scripts/assign-categories.js <csvパス>            … ドライラン(検証のみ)
 *   node scripts/assign-categories.js <csvパス> --commit   … カテゴリー作成＋割り当て実行
 *
 * --commit には Products の書き込みスコープが必要です。
 *
 * Shopify Tag → BigCommerce カテゴリー のマッピング:
 *   常温              -> 常温商品
 *   冷蔵              -> 冷蔵商品
 *   冷凍              -> 冷凍商品
 *   冷凍送料無料セット -> 送料無料
 *   冷蔵送料無料セット -> 送料無料
 * ※「セレクト商品」は手動キュレーションのため空カテゴリーとして作成のみ。
 * ※「お吸い物」は温度帯4カテゴリーに該当しないため未割り当て(要指定)。
 */
require('dotenv').config({ path: ['.env.local', '.env'] });
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { client } = require('../lib/bigcommerce');

const csvPath = process.argv[2];
const COMMIT = process.argv.includes('--commit');
if (!csvPath) {
  console.error('CSVパスを指定してください');
  process.exit(1);
}

// 作成するカテゴリー(Shopify のコレクションに対応)
const CATEGORY_NAMES = ['常温商品', '冷蔵商品', '冷凍商品', '送料無料', 'セレクト商品'];

// Tag → カテゴリー名
const TAG_TO_CATEGORY = {
  常温: '常温商品',
  冷蔵: '冷蔵商品',
  冷凍: '冷凍商品',
  冷凍送料無料セット: '送料無料',
  冷蔵送料無料セット: '送料無料',
};

function parseCsvProducts(path) {
  const records = parse(fs.readFileSync(path), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  });
  // 親行(Titleあり)だけ
  return records
    .filter((r) => r.Title && r.Title.trim())
    .map((r) => ({
      name: r.Title.trim(),
      tag: (r.Tags || '').trim(),
    }));
}

async function ensureCategories() {
  const { data } = await client.get('/catalog/categories', { params: { limit: 250 } });
  const byName = new Map(data.data.map((c) => [c.name, c.id]));
  const result = {};
  for (const name of CATEGORY_NAMES) {
    if (byName.has(name)) {
      result[name] = byName.get(name);
      console.log(`category exists: ${name} (id=${result[name]})`);
    } else if (COMMIT) {
      const { data: created } = await client.post('/catalog/categories', {
        name,
        parent_id: 0,
        is_visible: true,
      });
      result[name] = created.data.id;
      console.log(`category created: ${name} (id=${result[name]})`);
    } else {
      result[name] = null;
      console.log(`category (作成予定): ${name}`);
    }
  }
  return result;
}

async function fetchProductIdMap() {
  const map = new Map();
  let page = 1;
  for (;;) {
    const { data } = await client.get('/catalog/products', {
      params: { limit: 250, page, include_fields: 'name' },
    });
    for (const p of data.data) map.set(p.name, p.id);
    if (page >= data.meta.pagination.total_pages) break;
    page++;
  }
  return map;
}

async function main() {
  const products = parseCsvProducts(csvPath);
  const catIds = await ensureCategories();
  const idMap = await fetchProductIdMap();

  const assignments = []; // {name, productId, category}
  const unmatched = [];
  const noCategory = [];

  for (const p of products) {
    const category = TAG_TO_CATEGORY[p.tag];
    if (!category) {
      if (p.tag) noCategory.push(`${p.name} (tag:${p.tag})`);
      continue;
    }
    const productId = idMap.get(p.name);
    if (!productId) {
      unmatched.push(p.name);
      continue;
    }
    assignments.push({ name: p.name, productId, category });
  }

  console.log(`\n=== 割り当て計画 ===`);
  const byCat = {};
  for (const a of assignments) byCat[a.category] = (byCat[a.category] || 0) + 1;
  for (const [c, n] of Object.entries(byCat)) console.log(`  ${c}: ${n}件`);
  if (noCategory.length)
    console.log(`\n温度帯カテゴリー対象外(未割当): ${noCategory.join(', ')}`);
  if (unmatched.length)
    console.log(`\nBigCommerceに見つからない商品(スキップ): ${unmatched.join(', ')}`);

  if (!COMMIT) {
    console.log(`\n[ドライラン] 書き込みなし。--commit で実行します。`);
    return;
  }

  console.log(`\n=== 割り当て実行 ===`);
  let ok = 0;
  for (const a of assignments) {
    try {
      await client.put(`/catalog/products/${a.productId}`, {
        categories: [catIds[a.category]],
      });
      ok++;
    } catch (e) {
      const status = e.response && e.response.status;
      console.error(`error: ${a.name} (HTTP ${status})`);
      if (status === 403) {
        console.error('→ 書き込み権限がありません。');
        process.exit(1);
      }
    }
  }
  console.log(`\n完了: ${ok}/${assignments.length} 件を割り当て`);
  console.log(`※「セレクト商品」「お吸い物」は別途割り当てが必要です。`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
