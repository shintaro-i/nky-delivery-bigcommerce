# Cloudflare Worker (Hono) — 配送/データAPI

本 API は **Cloudflare Worker（Hono, `src/`）一本**で運用する。
以前併存していた Express（`index.js` / `api/` / `lib/`）＋ Vercel は、
**ロジックの二重管理（送料計算が2ファイルに分かれてドリフトする）を避けるため廃止**した。
現在の唯一の正は `src/`（送料ロジックは `src/lib/shipping.ts`）。

## 構成
- `src/index.ts` … Hono アプリ（CORS・`/health`・各ルートをマウント）
- `src/routes/*.ts` … shipping-calculate / products / categories / news / addresses / orders
- `src/lib/shipping.ts` … 送料ロジック（純関数・Express版から移植）
- `src/lib/bigcommerce.ts` … BigCommerce クライアント（axios→fetch・env注入）
- `wrangler.jsonc` / `tsconfig.json`

## 検証済み（`wrangler dev` + 実データ）
（移植時に）旧 Express 版（:3001）と**出力一致**を確認済み：
shipping-calculate（直接指定・productId経由）／products 一覧・詳細・inventory／
categories／news／orders/:id/shipping（英語県名解決含む）／404・addresses。

## ローカル実行
```bash
npm run cf:dev          # wrangler dev (http://localhost:8787)
npm run cf:typecheck    # tsc --noEmit
```
※ ローカル実行には `.dev.vars`（`BIGCOMMERCE_STORE_HASH` / `_ACCESS_TOKEN` / `_CONTENT_TOKEN`）が必要。

## デプロイ（リリース時・要 Cloudflare アカウント）
```bash
npx wrangler login
# シークレット登録（3つ）
npx wrangler secret put BIGCOMMERCE_STORE_HASH
npx wrangler secret put BIGCOMMERCE_ACCESS_TOKEN
npx wrangler secret put BIGCOMMERCE_CONTENT_TOKEN
# デプロイ（初回に Worker `nky-delivery-bigcommerce` が作成される）
npm run cf:deploy
```
デプロイ後、**storefront 側の `API_BASE`** をこの Worker の公開URL
（現行：`https://nky-delivery-bigcommerce.nikkoyuba-ec.workers.dev`、または割当てた独自ドメイン）に設定する。

## 管理用スクリプト（据え置き）
`scripts/`（カテゴリ割当・Shopifyインポート・テスト商品seed）は Node 実行の CommonJS ツールで、
Worker 本体（`src/`）とは独立。BigCommerce クライアントは `scripts/lib/bigcommerce.js` を共用。
`axios` / `csv-parse` / `dotenv` はこのスクリプト群専用の devDependencies。
