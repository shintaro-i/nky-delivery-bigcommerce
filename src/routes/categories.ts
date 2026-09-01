import { Hono } from "hono";
import type { Env } from "../env";
import { createBc } from "../lib/bigcommerce";

const app = new Hono<{ Bindings: Env }>();

// GET /api/categories  (ナビ用の表示中カテゴリー一覧)
app.get("/", async (c) => {
  try {
    const categories = await createBc(c.env).listCategories();
    return c.json({ categories });
  } catch (error) {
    console.error("Category list error:", (error as Error).message);
    return c.json({ error: "Failed to fetch categories" }, 500);
  }
});

export default app;
