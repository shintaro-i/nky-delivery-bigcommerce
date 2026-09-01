// Cloudflare Worker の環境変数(secrets)。wrangler.jsonc / .dev.vars / secrets で設定。
export type Env = {
  BIGCOMMERCE_STORE_HASH: string;
  BIGCOMMERCE_ACCESS_TOKEN: string;
  // ブログ(お知らせ)用の Content スコープトークン。無ければ ACCESS_TOKEN にフォールバック。
  BIGCOMMERCE_CONTENT_TOKEN?: string;
};
