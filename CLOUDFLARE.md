# Cloudflare Worker (Hono) — 配送/データAPI

本 API を **Cloudflare Worker（Hono）** に移行するための構成。
既存の Express（`index.js` / `api/` / `lib/`）＋ Vercel は**当面そのまま残す**（デュアル構成）。
Vercel は `wrangler.jsonc` / `src/` を無視するため現行デプロイに影響しない。
本番/テストの Cloudflare 化時に、この Worker をデプロイして切り替える。

## 構成
- `src/index.ts` … Hono アプリ（CORS・`/health`・各ルートをマウント）
- `src/routes/*.ts` … shipping-calculate / products / categories / news / addresses / orders
- `src/lib/shipping.ts` … 送料ロジック（純関数・Express版から移植）
- `src/lib/bigcommerce.ts` … BigCommerce クライアント（axios→fetch・env注入）
- `wrangler.jsonc` / `tsconfig.json`

## 検証済み（`wrangler dev` + 実データ）
Express版（:3001）と**出力一致**を確認：
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
（例：`https://nky-delivery-bigcommerce.<subdomain>.workers.dev`、または割当てた独自ドメイン）へ変更する。

## 切り替え完了後（任意）
Express（`index.js` / `api/` / `lib/`）・`vercel.json`・`axios`/`express`/`cors` 依存は撤去可能。
`scripts/`（カテゴリ割当・インポート等の一度きりCLI）は Node 実行のため据え置き。
