import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage, money } from "../api";
import type { Dashboard, InventoryResponse, Order, OrderStatus } from "../types";

// Next steps a shopkeeper may take from each status (mirrors the server rules)
const NEXT_STEPS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  placed: ["confirmed", "cancelled"],
  confirmed: ["packed", "cancelled"],
  packed: ["ready", "cancelled"],
  ready: ["completed"],
};

const emptyProduct = { name: "", category: "", unit: "", price: "", stock: "", discount_percent: "0" };

export default function ShopDashboard() {
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [inv, setInv] = useState<InventoryResponse | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState(emptyProduct);
  const [restockQty, setRestockQty] = useState<Record<number, string>>({});

  async function refresh() {
    try {
      const [d, i, o] = await Promise.all([
        api<Dashboard>("/shop/dashboard"),
        api<InventoryResponse>("/shop/inventory"),
        api<Order[]>("/shop/orders"),
      ]);
      setDash(d);
      setInv(i);
      setOrders(o);
    } catch (e) {
      setMessage(errorMessage(e));
    }
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 10_000); // new orders appear without a reload
    return () => clearInterval(timer);
  }, []);

  async function addProduct(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/shop/products", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          category: form.category,
          unit: form.unit,
          price: form.price,
          stock: Number(form.stock),
          discount_percent: Number(form.discount_percent),
        }),
      });
      setForm(emptyProduct);
      setMessage("Product added");
      refresh();
    } catch (err) {
      setMessage(errorMessage(err));
    }
  }

  async function restock(productId: number) {
    const qty = Number(restockQty[productId]);
    if (!qty) return;
    try {
      await api(`/shop/products/${productId}/restock`, {
        method: "POST",
        body: JSON.stringify({ quantity: qty, reason: qty > 0 ? "restock" : "correction" }),
      });
      setRestockQty((r) => ({ ...r, [productId]: "" }));
      refresh();
    } catch (err) {
      setMessage(errorMessage(err));
    }
  }

  async function setStatus(orderId: number, status: OrderStatus) {
    try {
      await api(`/orders/${orderId}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      refresh();
    } catch (err) {
      setMessage(errorMessage(err));
    }
  }

  async function toggleOpen() {
    if (!dash) return;
    await api("/shop/me", { method: "PATCH", body: JSON.stringify({ is_open: !dash.shop.is_open }) });
    refresh();
  }

  return (
    <main style={{ display: "grid", gap: 20, padding: 16, maxWidth: 1000, margin: "0 auto" }}>
      {message && <p role="status">{message}</p>}

      {dash && (
        <section>
          <h2>
            {dash.shop.name} <button onClick={toggleOpen}>{dash.shop.is_open ? "Close shop" : "Open shop"}</button>
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            <Stat label="Revenue today" value={money(dash.revenue_today.revenue)} sub={`${dash.revenue_today.orders} orders`} />
            <Stat label="Revenue (7 days)" value={money(dash.revenue_7d.revenue)} sub={`${dash.revenue_7d.orders} orders`} />
            <Stat label="Total revenue" value={money(dash.revenue_all.revenue)} sub={`${dash.revenue_all.orders} orders`} />
            <Stat label="Shop rating" value={`★ ${dash.shop_rating.avg.toFixed(1)}`} sub={`${dash.shop_rating.count} reviews`} />
            <Stat label="Delivery rating" value={`★ ${dash.delivery_rating.avg.toFixed(1)}`} sub={`${dash.delivery_rating.count} reviews`} />
            <Stat label="Customers" value={String(dash.customers)} sub={`${Math.round(dash.cancel_rate * 100)}% cancelled`} />
          </div>
        </section>
      )}

      <section>
        <h2>Incoming orders ({orders.length})</h2>
        {orders.length === 0 && <p>No active orders.</p>}
        {orders.map((o) => (
          <div key={o.id} style={box}>
            <strong>#{o.id}</strong> · {o.fulfilment} · {money(o.total)} · <b>{o.status}</b>
            <ul>
              {o.items.map((i) => (
                <li key={i.id}>{i.name} × {i.quantity} @ {money(i.unit_price)}</li>
              ))}
            </ul>
            {o.delivery_address && <p>Deliver to: {o.delivery_address}</p>}
            {(NEXT_STEPS[o.status] ?? []).map((s) => (
              <button key={s} onClick={() => setStatus(o.id, s)} style={{ marginRight: 8 }}>
                Mark {s}
              </button>
            ))}
          </div>
        ))}
      </section>

      <section>
        <h2>Add product</h2>
        <form onSubmit={addProduct} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
          {(["name", "category", "unit", "price", "stock", "discount_percent"] as const).map((field) => (
            <input
              key={field}
              required={field !== "discount_percent"}
              placeholder={field.replace("_", " ")}
              value={form[field]}
              onChange={(e) => setForm({ ...form, [field]: e.target.value })}
            />
          ))}
          <button type="submit">Add product</button>
        </form>
      </section>

      {inv && (
        <section>
          <h2>Inventory</h2>
          {inv.low_stock.length > 0 && <p style={{ color: "darkorange" }}>Low stock: {inv.low_stock.join(", ")}</p>}
          {inv.categories.map((cat) => (
            <div key={cat.name}>
              <h3>{cat.name}</h3>
              {cat.products.map((p) => (
                <div key={p.id} style={rowStyle}>
                  <div>
                    {p.name} ({p.unit}) · {money(p.price)}
                    {p.discount_percent > 0 && ` (${p.discount_percent}% off)`} · stock {p.stock}
                  </div>
                  <span>
                    <input
                      type="number"
                      placeholder="+/- qty"
                      value={restockQty[p.id] ?? ""}
                      onChange={(e) => setRestockQty({ ...restockQty, [p.id]: e.target.value })}
                      style={{ width: 90 }}
                    />{" "}
                    <button onClick={() => restock(p.id)}>Update stock</button>
                  </span>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={box}>
      <small>{label}</small>
      <div style={{ fontSize: 22, fontWeight: 600 }}>{value}</div>
      <small>{sub}</small>
    </div>
  );
}

const box: React.CSSProperties = { border: "1px solid #ddd", borderRadius: 10, padding: 12, background: "#fff" };
const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #eee" };
