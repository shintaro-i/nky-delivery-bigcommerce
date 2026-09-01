import { Hono } from "hono";
import type { Env } from "../env";

const app = new Hono<{ Bindings: Env }>();

// 【レガシー・現storefront未使用】住所帳の簡易保管。
// storefront は独自の /api/account/addresses(BigCommerce直)を使うため、この
// エンドポイントは現在使われていない。Express版はプロセス内メモリ保持だったが、
// Workers ではインスタンス間で共有されず永続もしないため、あくまで互換用スタブ。
// 永続化が必要になったら KV / D1 等へ置き換えること。
const addressStore: Record<string, any[]> = {};

app.get("/:customerId", (c) => {
  const customerId = c.req.param("customerId");
  return c.json({ addresses: addressStore[customerId] || [] });
});

app.post("/:customerId", async (c) => {
  const customerId = c.req.param("customerId");
  const { address } = await c.req.json<{ address?: any }>();

  if (!address || !address.prefecture || !address.city || !address.street) {
    return c.json({ error: "address must have prefecture, city, and street" }, 400);
  }
  if (!addressStore[customerId]) addressStore[customerId] = [];

  const newAddress = {
    id: Date.now().toString(),
    ...address,
    createdAt: new Date().toISOString(),
  };
  addressStore[customerId].push(newAddress);
  return c.json(newAddress);
});

app.put("/:customerId/:addressId", async (c) => {
  const customerId = c.req.param("customerId");
  const addressId = c.req.param("addressId");
  const { address } = await c.req.json<{ address?: any }>();

  if (!addressStore[customerId]) return c.json({ error: "Customer not found" }, 404);
  const idx = addressStore[customerId].findIndex((a) => a.id === addressId);
  if (idx === -1) return c.json({ error: "Address not found" }, 404);

  addressStore[customerId][idx] = {
    ...addressStore[customerId][idx],
    ...address,
    updatedAt: new Date().toISOString(),
  };
  return c.json(addressStore[customerId][idx]);
});

app.delete("/:customerId/:addressId", (c) => {
  const customerId = c.req.param("customerId");
  const addressId = c.req.param("addressId");

  if (!addressStore[customerId]) return c.json({ error: "Customer not found" }, 404);
  const idx = addressStore[customerId].findIndex((a) => a.id === addressId);
  if (idx === -1) return c.json({ error: "Address not found" }, 404);

  addressStore[customerId].splice(idx, 1);
  return c.json({ success: true });
});

export default app;
