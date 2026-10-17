import { useEffect, useRef, useState } from "react";
import { api, errorMessage, money } from "../api";
import { useLiveLocation } from "../useLiveLocation";
import type { NearbyShop, Order, Product, ShopDetail } from "../types";

export default function CustomerHome() {
  const { coords, error: geoError } = useLiveLocation(true);
  const [shops, setShops] = useState<NearbyShop[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ShopDetail | null>(null);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [fulfilment, setFulfilment] = useState<"pickup" | "delivery">("pickup");
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  // One key per checkout attempt, so a retried click never creates a second order
  const checkoutKey = useRef<string>(crypto.randomUUID());

  // Nearby shops follow the live location
  useEffect(() => {
    if (!coords) return;
    api<NearbyShop[]>(`/shops/nearby?lat=${coords.lat}&lng=${coords.lng}&radius_km=5`)
      .then(setShops)
      .catch((e) => setMessage(errorMessage(e)));
  }, [coords?.lat, coords?.lng]);

  // Shop detail is re-fetched every 15s so the prices shown are live
  useEffect(() => {
    if (selectedId === null) return;
    let alive = true;
    const load = () =>
      api<ShopDetail>(`/shops/${selectedId}`)
        .then((d) => alive && setDetail(d))
        .catch((e) => alive && setMessage(errorMessage(e)));
    load();
    const timer = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [selectedId]);

  const refreshOrders = () => api<Order[]>("/orders/mine").then(setOrders).catch(() => {});
  useEffect(() => {
    refreshOrders();
    const timer = setInterval(refreshOrders, 15_000);
    return () => clearInterval(timer);
  }, []);

  const allProducts = new Map<number, Product>();
  detail?.categories.forEach((c) => c.products.forEach((p) => allProducts.set(p.id, p)));

  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ product: allProducts.get(Number(id)), qty }))
    .filter((l): l is { product: Product; qty: number } => !!l.product && l.qty > 0);
  const total = lines.reduce((sum, l) => sum + Number(l.product.price) * l.qty, 0);

  const setQty = (product: Product, qty: number) =>
    setCart((c) => ({ ...c, [product.id]: Math.max(0, Math.min(qty, product.stock)) }));

  async function join(code: string) {
    try {
      const res = await api<{ name: string }>("/shops/join", {
        method: "POST",
        body: JSON.stringify({ invite_code: code }),
      });
      setMessage(`You are now a member of ${res.name}`);
    } catch (e) {
      setMessage(errorMessage(e));
    }
  }

  async function placeOrder() {
    if (!detail || lines.length === 0 || !coords) return;
    if (fulfilment === "delivery" && !address.trim()) {
      setMessage("Enter your delivery address");
      return;
    }
    try {
      const order = await api<Order>("/orders", {
        method: "POST",
        body: JSON.stringify({
          shop_id: detail.shop.id,
          fulfilment,
          items: lines.map((l) => ({
            product_id: l.product.id,
            quantity: l.qty,
            expected_price: l.product.price,
          })),
          delivery_address: fulfilment === "delivery" ? address : null,
          delivery_lat: fulfilment === "delivery" ? coords.lat : null,
          delivery_lng: fulfilment === "delivery" ? coords.lng : null,
          idempotency_key: checkoutKey.current,
        }),
      });
      checkoutKey.current = crypto.randomUUID();
      setCart({});
      setMessage(`Order #${order.id} placed. Total ${money(order.total)}`);
      refreshOrders();
    } catch (e) {
      setMessage(errorMessage(e));
      setSelectedId(detail.shop.id); // reload prices and stock after a conflict
    }
  }

  return (
    <main style={{ display: "grid", gap: 16, padding: 16, maxWidth: 960, margin: "0 auto" }}>
      {geoError && <p style={{ color: "crimson" }}>Location: {geoError}</p>}
      {message && <p role="status">{message}</p>}

      {!detail && (
        <section>
          <h2>Shops near you</h2>
          {!coords && <p>Waiting for your location…</p>}
          {coords && shops.length === 0 && <p>No open shops within 5 km.</p>}
          {shops.map((s) => (
            <button key={s.id} onClick={() => setSelectedId(s.id)} style={cardStyle}>
              <strong>{s.name}</strong>
              <div>{s.distance_km} km away · ★ {s.shop_rating.toFixed(1)} ({s.shop_rating_count})</div>
              <div>{s.delivers_to_you ? "Delivers to you" : "Pickup only"}{s.is_member ? " · Member" : ""}</div>
            </button>
          ))}
        </section>
      )}

      {detail && (
        <section>
          <button onClick={() => { setDetail(null); setSelectedId(null); setCart({}); }}>← Back to shops</button>
          <h2>{detail.shop.name}</h2>
          <p>{detail.shop.address}</p>
          <button onClick={() => join(prompt("Enter the shop's invite code") ?? "")}>Join shop</button>

          {detail.categories.map((cat) => (
            <div key={cat.name}>
              <h3>{cat.name}</h3>
              {cat.products.map((p) => (
                <div key={p.id} style={rowStyle}>
                  <div>
                    <strong>{p.name}</strong> <span>({p.unit})</span>
                    <div>
                      {p.discount_percent > 0 && <s>{money(p.list_price)} </s>}
                      <b>{money(p.price)}</b>
                      {p.discount_percent > 0 && <span> · {p.discount_percent}% off</span>}
                    </div>
                    <small>{p.in_stock ? `${p.stock} available` : "Out of stock"}</small>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={p.stock}
                    value={cart[p.id] ?? 0}
                    disabled={!p.in_stock}
                    onChange={(e) => setQty(p, Number(e.target.value))}
                    aria-label={`Quantity of ${p.name}`}
                    style={{ width: 64 }}
                  />
                </div>
              ))}
            </div>
          ))}

          <div style={{ ...cardStyle, cursor: "default" }}>
            <h3>Your cart</h3>
            {lines.length === 0 && <p>Nothing added yet.</p>}
            {lines.map((l) => (
              <div key={l.product.id}>
                {l.product.name} × {l.qty} = {money(Number(l.product.price) * l.qty)}
              </div>
            ))}
            <p><b>Total: {money(total)}</b></p>
            <label>
              <input type="radio" checked={fulfilment === "pickup"} onChange={() => setFulfilment("pickup")} />
              Pick up at shop
            </label>{" "}
            <label>
              <input
                type="radio"
                checked={fulfilment === "delivery"}
                disabled={!detail.shop.delivery_radius_km}
                onChange={() => setFulfilment("delivery")}
              />
              Delivery (within {detail.shop.delivery_radius_km} km)
            </label>
            {fulfilment === "delivery" && (
              <textarea
                placeholder="Full delivery address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                style={{ display: "block", width: "100%", marginTop: 8 }}
              />
            )}
            <button onClick={placeOrder} disabled={lines.length === 0} style={{ marginTop: 8 }}>
              Place order
            </button>
          </div>
        </section>
      )}

      <section>
        <h2>My orders</h2>
        {orders.length === 0 && <p>No orders yet.</p>}
        {orders.map((o) => (
          <div key={o.id} style={cardStyle as React.CSSProperties}>
            <strong>Order #{o.id}</strong> · {o.status} · {money(o.total)} · {o.fulfilment}
          </div>
        ))}
      </section>
    </main>
  );
}

const cardStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: 12,
  margin: "8px 0",
  border: "1px solid #ddd",
  borderRadius: 10,
  background: "#fff",
  cursor: "pointer",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "8px 0",
  borderBottom: "1px solid #eee",
};
