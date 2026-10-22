import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, Minus, MapPin, Plus, ShoppingBag, Star, Store, Truck, Package } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Badge, Button, Empty, Modal, Skeleton, Stars, inputClass, useToast } from "../../components/ui";
import { api, errorMessage, money, useFetch } from "../../lib/api";
import { distanceKm } from "../../lib/geo";
import { useLiveLocation } from "../../lib/useLiveLocation";
import type { Product, ShopDetail } from "../../types";

export default function ShopPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const detail = useFetch<ShopDetail>(`/shops/${id}`, 15000); // live prices every 15s
  const { coords } = useLiveLocation(true);

  const [category, setCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [fulfilment, setFulfilment] = useState<"pickup" | "delivery">("pickup");
  const [address, setAddress] = useState("");
  const [placing, setPlacing] = useState(false);
  const checkoutKey = useRef<string>(crypto.randomUUID());

  const shop = detail.data?.shop;
  const products = useMemo(() => detail.data?.categories.flatMap((c) => c.products) ?? [], [detail.data]);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const activeCategory = category ?? detail.data?.categories[0]?.name ?? null;
  const visible = detail.data?.categories.find((c) => c.name === activeCategory)?.products ?? [];

  const lines = Object.entries(cart)
    .map(([pid, qty]) => ({ product: byId.get(Number(pid)), qty }))
    .filter((l): l is { product: Product; qty: number } => !!l.product && l.qty > 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const total = lines.reduce((s, l) => s + Number(l.product.price) * l.qty, 0);

  const distance = shop && coords ? distanceKm(coords, { lat: shop.lat, lng: shop.lng }) : null;
  const canDeliver = !!shop && distance !== null && distance <= shop.delivery_radius_km;

  function setQty(p: Product, qty: number) {
    setCart((c) => ({ ...c, [p.id]: Math.max(0, Math.min(qty, p.stock)) }));
  }

  async function placeOrder() {
    if (!shop || lines.length === 0 || !coords) return;
    if (fulfilment === "delivery" && (!canDeliver || address.trim().length < 10)) {
      toast("Enter a full delivery address within the delivery range", "error");
      return;
    }
    setPlacing(true);
    try {
      const order = await api<{ id: number; total: string }>("/orders", {
        method: "POST",
        body: JSON.stringify({
          shop_id: shop.id,
          fulfilment,
          items: lines.map((l) => ({ product_id: l.product.id, quantity: l.qty, expected_price: l.product.price })),
          delivery_address: fulfilment === "delivery" ? address.trim() : null,
          delivery_lat: fulfilment === "delivery" ? coords.lat : null,
          delivery_lng: fulfilment === "delivery" ? coords.lng : null,
          idempotency_key: checkoutKey.current,
        }),
      });
      checkoutKey.current = crypto.randomUUID();
      setCart({});
      setCheckoutOpen(false);
      toast(`Order #${order.id} placed for ${money(order.total)}`);
      navigate("/customer/orders");
    } catch (e) {
      toast(errorMessage(e), "error"); // typically a price or stock change: reload
      detail.reload();
    } finally {
      setPlacing(false);
    }
  }

  if (detail.loading && !detail.data) {
    return <div className="grid gap-4"><Skeleton className="h-40" /><Skeleton className="h-64" /></div>;
  }
  if (!detail.data || !shop) {
    return <Empty icon={Store} title="Shop not available" body={detail.error ?? "It may be closed or no longer verified."} action={<Link to="/customer"><Button variant="secondary">Back to shops</Button></Link>} />;
  }

  return (
    <div className="space-y-6 pb-24">
      <Link to="/customer" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> All shops
      </Link>

      <motion.header initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{shop.name}</h1>
            <p className="mt-1 flex items-center gap-1 text-sm text-slate-500"><MapPin className="h-4 w-4" /> {shop.address}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="amber"><Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {shop.shop_rating.toFixed(1)} shop</Badge>
            <Badge tone="blue"><Truck className="h-3 w-3" /> {shop.delivery_rating.toFixed(1)} delivery</Badge>
            {distance !== null && <Badge tone="brand">{distance.toFixed(1)} km away</Badge>}
            {!shop.is_open && <Badge tone="red">Closed</Badge>}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-emerald-700">
          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-emerald-400" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
          Live prices · updated every 15 seconds
        </div>
      </motion.header>

      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {detail.data.categories.map((c) => (
          <button key={c.name} onClick={() => setCategory(c.name)}
            className={`relative shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${activeCategory === c.name ? "text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>
            {activeCategory === c.name && <motion.span layoutId="shop-cat" className="absolute inset-0 rounded-full gradient-brand" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
            <span className="relative">{c.name} <span className="opacity-70">({c.products.length})</span></span>
          </button>
        ))}
      </div>

      {detail.data.categories.length === 0 ? (
        <Empty icon={Package} title="No products listed yet" body="This shop hasn't added products yet. Check back soon." />
      ) : (
        <AnimatePresence mode="wait">
          <motion.div key={activeCategory} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((p, i) => {
              const qty = cart[p.id] ?? 0;
              return (
                <motion.div key={p.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                  className={`card flex flex-col p-5 ${!p.in_stock ? "opacity-60" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900">{p.name}</p>
                      <p className="text-xs text-slate-500">{p.unit}</p>
                    </div>
                    {p.discount_percent > 0 && <Badge tone="green">{p.discount_percent}% off</Badge>}
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <motion.span key={p.price} initial={{ scale: 1.15, color: "#f97316" }} animate={{ scale: 1, color: "#0f172a" }} className="text-xl font-extrabold">{money(p.price)}</motion.span>
                    {p.discount_percent > 0 && <span className="text-sm text-slate-400 line-through">{money(p.list_price)}</span>}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                    {p.rating_count > 0 && <><Stars value={p.rating_avg} size="h-3 w-3" /> {p.rating_avg.toFixed(1)}</>}
                    <span className={p.in_stock ? "text-emerald-600" : "text-rose-600"}>{p.in_stock ? `${p.stock} in stock` : "Out of stock"}</span>
                  </div>

                  <div className="mt-auto pt-4">
                    {qty === 0 ? (
                      <Button variant="secondary" className="w-full" disabled={!p.in_stock || !shop.is_open} onClick={() => setQty(p, 1)}>
                        <Plus className="h-4 w-4" /> Add to cart
                      </Button>
                    ) : (
                      <div className="flex items-center justify-between rounded-xl bg-brand-50 p-1.5 ring-1 ring-brand-200">
                        <button onClick={() => setQty(p, qty - 1)} className="grid h-9 w-9 place-items-center rounded-lg bg-white text-brand-700 shadow-sm active:scale-90" aria-label="Decrease"><Minus className="h-4 w-4" /></button>
                        <motion.span key={qty} initial={{ scale: 0.6 }} animate={{ scale: 1 }} className="font-bold text-brand-700">{qty}</motion.span>
                        <button onClick={() => setQty(p, qty + 1)} disabled={qty >= p.stock} className="grid h-9 w-9 place-items-center rounded-lg bg-white text-brand-700 shadow-sm active:scale-90 disabled:opacity-40" aria-label="Increase"><Plus className="h-4 w-4" /></button>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      )}

      {/* Floating cart bar */}
      <AnimatePresence>
        {count > 0 && (
          <motion.div initial={{ y: 120, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 120, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="fixed inset-x-3 bottom-24 z-30 mx-auto flex max-w-3xl items-center justify-between gap-4 rounded-2xl gradient-brand p-4 text-white shadow-2xl shadow-brand-500/40 lg:bottom-6">
            <div>
              <p className="text-xs font-medium text-white/80">{count} item{count > 1 ? "s" : ""}</p>
              <p className="text-lg font-extrabold">{money(total)}</p>
            </div>
            <Button variant="secondary" className="!text-brand-700" onClick={() => setCheckoutOpen(true)}>
              <ShoppingBag className="h-4 w-4" /> Checkout
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <Modal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} title="Review your order"
        footer={<>
          <Button variant="ghost" onClick={() => setCheckoutOpen(false)}>Keep shopping</Button>
          <Button onClick={placeOrder} loading={placing} disabled={lines.length === 0}>Place order · {money(total)}</Button>
        </>}>
        <ul className="divide-y divide-slate-100">
          {lines.map((l) => (
            <li key={l.product.id} className="flex items-center justify-between py-3">
              <div><p className="font-semibold">{l.product.name}</p><p className="text-xs text-slate-500">{money(l.product.price)} each</p></div>
              <div className="flex items-center gap-3">
                <button onClick={() => setQty(l.product, l.qty - 1)} className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100" aria-label="Decrease"><Minus className="h-3.5 w-3.5" /></button>
                <span className="w-5 text-center font-semibold">{l.qty}</span>
                <button onClick={() => setQty(l.product, l.qty + 1)} className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100" aria-label="Increase"><Plus className="h-3.5 w-3.5" /></button>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-5">
          <p className="mb-2 text-sm font-semibold text-slate-700">How do you want it?</p>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            {(["pickup", "delivery"] as const).map((opt) => (
              <button key={opt} onClick={() => setFulfilment(opt)} className={`relative rounded-lg py-2.5 text-sm font-semibold transition ${fulfilment === opt ? "text-brand-700" : "text-slate-500"}`}>
                {fulfilment === opt && <motion.span layoutId="fulfil" className="absolute inset-0 rounded-lg bg-white shadow-sm" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                <span className="relative inline-flex items-center gap-2">
                  {opt === "pickup" ? <Store className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
                  {opt === "pickup" ? "Pick up in store" : "Delivery"}
                </span>
              </button>
            ))}
          </div>
          <AnimatePresence initial={false}>
            {fulfilment === "delivery" && (
              <motion.div key="addr" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="pt-3">
                  {distance === null ? (
                    <p className="text-xs text-slate-500">Waiting for your location to check delivery range.</p>
                  ) : canDeliver ? (
                    <p className="flex items-center gap-1 text-xs font-medium text-emerald-700"><Check className="h-3.5 w-3.5" /> You're {distance.toFixed(1)} km away. Delivery available.</p>
                  ) : (
                    <p className="text-xs font-medium text-rose-600">You're {distance.toFixed(1)} km away. This shop delivers within {shop.delivery_radius_km} km. Pick up instead.</p>
                  )}
                  <textarea rows={3} className={`${inputClass} mt-2`} placeholder="Flat / house no., street, landmark" value={address} onChange={(e) => setAddress(e.target.value)} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <p className="mt-4 text-xs text-slate-500">Prices are confirmed at checkout. If anything changed, we'll ask you to review your cart.</p>
      </Modal>
    </div>
  );
}
