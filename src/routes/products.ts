import { Hono } from "hono";
import type { Env } from "../env";
import { createBc } from "../lib/bigcommerce";

const app = new Hono<{ Bindings: Env }>();

// GET /api/products/inventory?ids=1,2,3  (在庫。/:id より先に定義する必要あり)
app.get("/inventory", async (c) => {
  try {
    const ids = String(c.req.query("ids") || "")
      .split(",")
      .map((s) => parseInt(s, 10))
      .filter(Boolean);
    const inventory = await createBc(c.env).getInventory(ids);
    return c.json({ inventory });
  } catch (error) {
    console.error("Inventory error:", (error as Error).message);
    return c.json({ error: "Failed to fetch inventory" }, 500);
  }
});

// GET /api/products?limit=&page=&categoryId=&keyword=
app.get("/", async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query("limit") || "", 10) || 50, 250);
    const page = parseInt(c.req.query("page") || "", 10) || 1;
    const categoryId = parseInt(c.req.query("categoryId") || "", 10) || undefined;
    const keyword = c.req.query("keyword") ? String(c.req.query("keyword")) : undefined;

    const { products, pagination } = await createBc(c.env).listProducts({
      limit, page, categoryId, keyword,
    });
    return c.json({ products, pagination });
  } catch (error) {
    console.error("Product list error:", (error as Error).message);
    return c.json({ error: "Failed to fetch products" }, 500);
  }
});

// GET /api/products/:id  (単品詳細)
app.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const product = await createBc(c.env).getProductDetail(id);
    if (!product) return c.json({ error: `Product not found: ${id}` }, 404);
    return c.json({ product });
  } catch (error) {
    console.error("Product detail error:", (error as Error).message);
    return c.json({ error: "Failed to fetch product" }, 500);
  }
});

export default app;
