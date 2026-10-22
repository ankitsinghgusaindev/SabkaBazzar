import { AnimatePresence, motion } from "framer-motion";
import { Check, ReceiptText, Star, XCircle } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Empty, Modal, Skeleton, Stars, statusTone, useToast, inputClass } from "../../components/ui";
import { api, errorMessage, money, timeAgo, useFetch } from "../../lib/api";
import type { Order } from "../../types";

const STEPS = ["placed", "confirmed", "packed", "ready", "completed"] as const;

export default function CustomerOrders() {
  const orders = useFetch<Order[]>("/orders/mine", 15000);
  const toast = useToast();
  const [rating, setRating] = useState<Order | null>(null);

  async function cancel(o: Order) {
    try {
      await api(`/orders/${o.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) });
      toast("Order cancelled. Stock has been released.");
      orders.reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">My orders</h1>
        <p className="mt-1 text-sm text-slate-500">Status updates appear here automatically.</p>
      </div>

      {orders.loading && !orders.data ? (
        <div className="space-y-4">{[0, 1].map((i) => <Skeleton key={i} className="h-44" />)}</div>
      ) : !orders.data?.length ? (
        <Empty icon={ReceiptText} title="No orders yet" body="Find a shop nearby and place your first order." />
      ) : (
        <div className="space-y-4">
          <AnimatePresence>
            {orders.data.map((o) => {
              const cancelled = o.status === "cancelled";
              const stepIndex = STEPS.indexOf(o.status as (typeof STEPS)[number]);
              return (
                <motion.article key={o.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">Order #{o.id}</p>
                      <p className="text-xs text-slate-500">{timeAgo(o.created_at)} · {o.fulfilment === "delivery" ? "Delivery" : "Pickup"}</p>
                    </div>
                    <Badge tone={statusTone(o.status)}>{o.status}</Badge>
                  </div>

                  <ul className="mt-3 space-y-1 text-sm text-slate-600">
                    {o.items.map((it) => <li key={it.id}>{it.name} × {it.quantity} <span className="text-slate-400">({money(it.unit_price)} each)</span></li>)}
                  </ul>
                  <p className="mt-2 font-bold">Total {money(o.total)}</p>

                  {!cancelled ? (
                    <div className="mt-5">
                      <div className="flex items-center">
                        {STEPS.map((s, i) => (
                          <div key={s} className="flex flex-1 items-center last:flex-none">
                            <motion.span
                              initial={false}
                              animate={{ scale: i === stepIndex ? 1.15 : 1, backgroundColor: i <= stepIndex ? "#f97316" : "#e2e8f0" }}
                              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-white"
                            >
                              {i < stepIndex || (s === "completed" && i === stepIndex) ? <Check className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                            </motion.span>
                            {i < STEPS.length - 1 && (
                              <div className="mx-1 h-1 flex-1 overflow-hidden rounded-full bg-slate-200">
                                <motion.div className="h-full bg-brand-500" initial={false} animate={{ width: i < stepIndex ? "100%" : "0%" }} transition={{ duration: 0.5 }} />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex justify-between text-[11px] font-medium capitalize text-slate-500">
                        {STEPS.map((s) => <span key={s}>{s}</span>)}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-4 flex items-center gap-2 text-sm font-medium text-rose-600"><XCircle className="h-4 w-4" /> This order was cancelled.</p>
                  )}

                  <div className="mt-5 flex flex-wrap gap-2">
                    {o.status === "placed" && <Button variant="danger" onClick={() => cancel(o)}>Cancel order</Button>}
                    {o.status === "completed" && !o.reviewed && (
                      <Button variant="secondary" onClick={() => setRating(o)}><Star className="h-4 w-4 text-amber-500" /> Rate this order</Button>
                    )}
                    {o.status === "completed" && o.reviewed && <Badge tone="green"><Check className="h-3 w-3" /> Thanks for your review</Badge>}
                  </div>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <RateModal order={rating} onClose={() => setRating(null)} onDone={() => { setRating(null); toast("Thanks for your feedback!"); orders.reload(); }} />
    </div>
  );
}

function RateModal({ order, onClose, onDone }: { order: Order | null; onClose: () => void; onDone: () => void }) {
  const [shopStars, setShopStars] = useState(0);
  const [deliveryStars, setDeliveryStars] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function submit() {
    if (!order || shopStars === 0) return;
    setSaving(true);
    try {
      await api(`/orders/${order.id}/review`, {
        method: "POST",
        body: JSON.stringify({
          shop_stars: shopStars,
          delivery_stars: order.fulfilment === "delivery" ? deliveryStars || null : null,
          product_reviews: [],
        }),
      });
      setShopStars(0); setDeliveryStars(0); setComment("");
      onDone();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={!!order} onClose={onClose} title={`Rate order #${order?.id ?? ""}`}
      footer={<><Button variant="ghost" onClick={onClose}>Not now</Button><Button onClick={submit} loading={saving} disabled={shopStars === 0}>Submit review</Button></>}>
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-semibold">How was the shop?</p>
          <Stars value={shopStars} onChange={setShopStars} size="h-8 w-8" />
        </div>
        {order?.fulfilment === "delivery" && (
          <div>
            <p className="mb-2 text-sm font-semibold">How was the delivery?</p>
            <Stars value={deliveryStars} onChange={setDeliveryStars} size="h-8 w-8" />
          </div>
        )}
        <textarea rows={2} className={inputClass} placeholder="Anything else? (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
        <p className="text-xs text-slate-500">Ratings are public and help other customers choose shops.</p>
      </div>
    </Modal>
  );
}
