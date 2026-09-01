import { Hono } from "hono";
import type { Env } from "../env";
import { createBc, BcError } from "../lib/bigcommerce";

const app = new Hono<{ Bindings: Env }>();

// GET /api/news?limit=  (BigCommerce ブログ投稿=お知らせ。新しい順)
// ※ トークンに Content(Read-only) スコープが必要。
app.get("/", async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query("limit") || "", 10) || 10, 50);
    const posts = await createBc(c.env).getBlogPosts(limit);
    return c.json({ news: posts });
  } catch (error) {
    const status = error instanceof BcError ? error.status : undefined;
    console.error("News error:", status, (error as Error).message);
    // Content スコープ未付与(403)や失敗でも画面を壊さないよう空で返す
    return c.json({ news: [], error: status === 403 ? "content_scope_required" : "failed" });
  }
});

export default app;
