import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env";
import shippingCalculate from "./routes/shipping-calculate";
import products from "./routes/products";
import categories from "./routes/categories";
import news from "./routes/news";
import addresses from "./routes/addresses";
import orders from "./routes/orders";

// BigCommerce 配送/データAPI(Cloudflare Worker / Hono版)。
// Express版 index.js からの移植。ルート構成・レスポンス形は現状維持。
const app = new Hono<{ Bindings: Env }>();

// 現状の Express は cors() で全許可。まずは同挙動。
// 本番で絞る場合は storefront のオリジンに限定する。
app.use("*", cors());

app.route("/api/shipping-calculate", shippingCalculate);
app.route("/api/products", products);
app.route("/api/categories", categories);
app.route("/api/news", news);
app.route("/api/addresses", addresses);
app.route("/api/orders", orders);

app.get("/health", (c) => c.json({ status: "ok" }));
app.get("/", (c) => c.text("nky-delivery-bigcommerce (Cloudflare Worker)"));

export default app;
