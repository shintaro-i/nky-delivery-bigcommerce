/**
 * Shopify 商品CSVエクスポートを BigCommerce にインポートするスクリプト。
 *
 * 使い方:
 *   node scripts/import-shopify-products.js <csvパス>            … ドライラン(検証のみ・書込なし)
 *   node scripts/import-shopify-products.js <csvパス> --commit   … 実際に BigCommerce に登録
 *
 * --commit には BigCommerce の「Products: modify(read/write)」スコープのトークンが必要です。
 * 既に同名の商品があればスキップします(重複防止)。
 *
 * マッピング:
 *   Title -> name / Body(HTML) -> description / Variant SKU -> sku
 *   Variant Price -> price(税込) / Variant Grams -> weight(kg換算)
 *   shipping_type メタフィールド -> custom_fields[shipping_type]
 *   Image Src(全行) -> 商品画像(Image Position順)
 *   Status=active -> is_visible
 */
require('dotenv').config({ path: ['.env.local', '.env'] });
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { client } = require('../lib/bigcommerce');

const SHIPPING_TYPE_COL = 'shipping_type (product.metafields.custom.shipping_type)';

const csvPath = process.argv[2];
const COMMIT = process.argv.includes('--commit');
const INCLUDE_ALL = process.argv.includes('--include-all'); // shipping_type 無しも含める

if (!csvPath) {
  console.error('CSVパスを指定してください: node scripts/import-shopify-products.js <csv> [--commit]');
  process.exit(1);
}

/** Shopify CSV を Handle 単位の商品にまとめる */
function parseProducts(path) {
  const records = parse(fs.readFileSync(path), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  });

  const byHandle = new Map();
  for (const row of records) {
    const handle = row.Handle;
    if (!handle) continue;
    if (!byHandle.has(handle)) byHandle.set(handle, { parent: null, images: [] });
    const entry = byHandle.get(handle);
    if (row.Title && row.Title.trim() && !entry.parent) entry.parent = row;
    if (row['Image Src'] && row['Image Src'].trim()) {
      entry.images.push({
        url: row['Image Src'].trim(),
        position: parseInt(row['Image Position'], 10) || 999,
        alt: (row['Image Alt Text'] || '').trim(),
      });
    }
  }

  const products = [];
  for (const [handle, { parent, images }] of byHandle) {
    if (!parent) continue;
    const grams = parseFloat(parent['Variant Grams']) || 0;
    images.sort((a, b) => a.position - b.position);
    products.push({
      handle,
      name: parent.Title.trim(),
      description: parent['Body (HTML)'] || '',
      sku: (parent['Variant SKU'] || '').trim(),
      price: parseFloat(parent['Variant Price']) || 0,
      weight: grams > 0 ? +(grams / 1000).toFixed(3) : 0.1,
      shippingType: (parent[SHIPPING_TYPE_COL] || '').trim(),
      isVisible: (parent.Status || '').trim() === 'active',
      images,
    });
  }
  return products;
}

async function findByName(name) {
  const { data } = await client.get('/catalog/products', {
    params: { 'name:like': name, limit: 5 },
  });
  return data.data.find((p) => p.name === name) || null;
}

async function createProduct(p) {
  const body = {
    name: p.name,
    type: 'physical',
    weight: p.weight,
    price: p.price,
    description: p.description,
    is_visible: p.isVisible,
  };
  if (p.sku) body.sku = p.sku;
  if (p.shippingType) {
    body.custom_fields = [{ name: 'shipping_type', value: p.shippingType }];
  }
  const { data } = await client.post('/catalog/products', body);
  const productId = data.data.id;

  // 画像を順に登録(BigCommerce が Shopify CDN の URL から取得)
  for (const img of p.images) {
    await client.post(`/catalog/products/${productId}/images`, {
      image_url: img.url,
      is_thumbnail: img.position === 1,
      sort_order: img.position,
      description: img.alt,
    });
  }
  return productId;
}

async function main() {
  const all = parseProducts(csvPath);
  const target = INCLUDE_ALL ? all : all.filter((p) => p.shippingType);
  const skipped = INCLUDE_ALL ? [] : all.filter((p) => !p.shippingType);

  console.log(`\n=== 解析結果 ===`);
  console.log(`CSV内の商品: ${all.length}`);
  console.log(`インポート対象: ${target.length}${INCLUDE_ALL ? '(全件)' : '(shipping_type あり)'}`);
  if (skipped.length) {
    console.log(`スキップ(shipping_type 無し): ${skipped.length} → ${skipped.map((s) => s.name).join(', ')}`);
    console.log(`  ※ これらも入れるには --include-all`);
  }

  // 検証・警告
  const warns = [];
  for (const p of target) {
    if (p.price <= 0) warns.push(`  [価格0] ${p.name}`);
    if (!p.sku) warns.push(`  [SKU無] ${p.name}`);
    if (p.images.length === 0) warns.push(`  [画像0] ${p.name}`);
  }
  if (warns.length) {
    console.log(`\n=== 警告 ===\n${warns.join('\n')}`);
  }

  console.log(`\n=== 対象商品(先頭10件) ===`);
  for (const p of target.slice(0, 10)) {
    console.log(
      `  ${p.name} | ¥${p.price} | ${p.shippingType || '-'} | 画像${p.images.length} | SKU:${p.sku || '(なし)'}`
    );
  }
  const totalImages = target.reduce((s, p) => s + p.images.length, 0);
  console.log(`\n合計 画像枚数: ${totalImages}`);

  if (!COMMIT) {
    console.log(`\n[ドライラン] 書き込みは行っていません。実行するには --commit を付けてください。`);
    return;
  }

  console.log(`\n=== インポート実行 ===`);
  let created = 0;
  let skippedExisting = 0;
  for (const p of target) {
    try {
      const existing = await findByName(p.name);
      if (existing) {
        console.log(`skip(既存): ${p.name} (id=${existing.id})`);
        skippedExisting++;
        continue;
      }
      const id = await createProduct(p);
      console.log(`created: ${p.name} (id=${id}, 画像${p.images.length})`);
      created++;
    } catch (error) {
      const status = error.response && error.response.status;
      const detail = error.response && JSON.stringify(error.response.data);
      console.error(`error: ${p.name} (HTTP ${status}) ${detail || error.message}`);
      if (status === 403) {
        console.error('→ トークンに Products の書き込み権限がありません。');
        process.exit(1);
      }
    }
  }
  console.log(`\n完了: 作成 ${created} / 既存スキップ ${skippedExisting} / 対象 ${target.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
