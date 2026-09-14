# nky-delivery-bigcommerce

BigCommerce 配送/データAPI（**Cloudflare Worker / Hono**）

> **構成**: 本APIは Cloudflare Worker（Hono, `src/`）**一本**で運用します。
> かつて併存していた Express/Vercel 版（`index.js` + `api/` + `lib/`）は
> 二重管理を避けるため廃止しました。送料などのロジックは `src/lib/` が唯一の正です。

## 機能

- 複数配送先の送料計算（商品ID指定 / インライン指定の両対応）
- 都道府県名から配送地域への自動判定
- 地域別・温度帯別の送料自動計算
- BigCommerce 商品の取得（`shipping_type` カスタムフィールド連携）
- BigCommerce 注文の複数配送先送料の再計算
- 配送先情報の管理

## セットアップ

```bash
npm install
cp .env.example .dev.vars   # wrangler dev 用のローカルシークレット
```

## 開発（Cloudflare ランタイムをローカルで）

```bash
npm run dev        # = wrangler dev
```

## デプロイ

```bash
npm run deploy     # = wrangler deploy
```

デプロイ先: `https://nky-delivery-bigcommerce.nikkoyuba-ec.workers.dev`

## API エンドポイント

### 送料計算
`region`（地域キー）または `prefecture`（都道府県名）のいずれかを指定します。
商品は `productId`+`quantity`（BigCommerce から `shipping_type`・価格を取得）か、
`shippingType`+`totalPrice` の直接指定が使えます。

```
POST /api/shipping-calculate
Body: {
  "destinations": [
    {
      "id": "dest-1",
      "prefecture": "東京都",
      "items": [
        { "productId": 112, "quantity": 1 }
      ]
    },
    {
      "id": "dest-2",
      "region": "okinawa",
      "items": [
        { "shippingType": "jouon", "totalPrice": 5000 }
      ]
    }
  ]
}
```

### 商品一覧
```
GET /api/products?limit=50&page=1
```
各商品の `id` / `name` / `sku` / `price` / `shippingType` を返します。

### 注文の送料再計算
```
GET /api/orders/:orderId/shipping
```
注文の配送先（consignment）ごとに送料を再計算します。

### 配送先管理
```
GET /api/addresses/:customerId
POST /api/addresses/:customerId
PUT /api/addresses/:customerId/:addressId
DELETE /api/addresses/:customerId/:addressId
```

## テスト商品の登録

送料計算は商品の `shipping_type` カスタムフィールドで配送区分を判定します。
対応する値: `jouon` / `reizo` / `reito` / `osuimono` / `free_reizo` / `free_reito`。

未登録の区分のテスト商品をまとめて作成するには（要 Products 書き込み権限のトークン）:

```bash
npm run seed
```

権限が無い場合は、管理画面 → Products → Add で商品を作成し、
カスタムフィールド `shipping_type` に上記いずれかの値を設定してください。

## 管理用スクリプト（`scripts/`）

商品インポートやカテゴリ割当などの一回限りの管理ツールは `scripts/` に置いています。
これらは Node で直接実行する CommonJS スクリプトで、Worker 本体（`src/`）とは独立です。
BigCommerce クライアントは `scripts/lib/bigcommerce.js` を共用し、`.env.local` の
`BIGCOMMERCE_STORE_HASH` / `BIGCOMMERCE_ACCESS_TOKEN` を読み込みます。
（`axios` / `csv-parse` / `dotenv` はこのスクリプト群のためだけの devDependencies です。）
