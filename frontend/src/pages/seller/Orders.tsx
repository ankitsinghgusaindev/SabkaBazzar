import { AnimatePresence, motion } from "framer-motion";
import { ClipboardList, Store, Truck } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Empty, PageHeader, Skeleton, statusTone, useToast } from "../../components/ui";
import { api, errorMessage, money, timeAgo, useFetch } from "../../lib/api";
import type { Order, OrderStatus } from "../../types";

const COLUMNS: { status: OrderStatus; label: string }[] = [
  { status: "placed", label: "New" },
  { status: "confirmed", label: "Accepted" },
  { status: "packed", label: "Packed" },
  { status: "ready", label: "Ready / dispatch" },
];

const ACTIONS: Partial<Record<OrderStatus, { to: OrderStatus; label: string; variant?: "primary" | "danger" | "secondary" }[]>> = {
  placed: [{ to: "confirmed", label: "Accept" }, { to: "cancelled", label: "Decline", variant: "danger" }],
  confirmed: [{ to: "packed", label: "Mark packed" }, { to: "cancelled", label: "Cancel", variant: "danger" }],
  packed: [{ to: "ready", label: "Ready" }, { to: "cancelled", label: "Cancel", variant: "danger" }],
  ready: [{ to: "completed", label: "Handed over" }],
};

export default function SellerOrders() {
  const orders = useFetch<Order[]>("/shop/orders", 8000);
  const toast = useToast();
  const [busy, setBusy] = useState<number | null>(null);

  async function move(order: Order, to: OrderStatus) {
    setBusy(order.id);
    try {
      await api(`/orders/${order.id}/status`, { method: "PATCH", body: JSON.stringify({ status: to }) });
      toast(`Order #${order.id} is now ${to}`);
      orders.reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  const list = orders.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Orders" subtitle="Move orders through each stage. Customers see every change live." />

      {orders.loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-64" />)}</div>
      ) : list.length === 0 ? (
        <Empty icon={ClipboardList} title="No active orders right now" body="When customers order from your shop, they'll appear here." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const items = list.filter((o) => o.status === col.status);
            return (
              <div key={col.status} className="rounded-2xl bg-slate-100/70 p-3">
                <div className="mb-3 flex items-center justify-between px-1">
                  <h3 className="text-sm font-bold text-slate-700">{col.label}</h3>
                  <Badge tone={statusTone(col.status)}>{items.length}</Badge>
                </div>
                <div className="space-y-3">
                  <AnimatePresence>
                    {items.map((o) => (
                      <motion.div key={o.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                        className="card p-4">
                        <div className="flex items-center justify-between">
                          <span className="font-bold">#{o.id}</span>
                          <span className="text-xs text-slate-400">{timeAgo(o.created_at)}</span>
                        </div>
                        <ul className="mt-2 space-y-1 text-sm text-slate-600">
                          {o.items.map((it) => <li key={it.id}>{it.name} <span className="text-slate-400">× {it.quantity}</span></li>)}
                        </ul>
                        <div className="mt-3 flex items-center justify-between text-sm">
                          <span className="inline-flex items-center gap-1 text-slate-500">
                            {o.fulfilment === "delivery" ? <Truck className="h-4 w-4" /> : <Store className="h-4 w-4" />}
                            {o.fulfilment === "delivery" ? "Delivery" : "Pickup"}
                          </span>
                          <span className="font-bold">{money(o.total)}</span>
                        </div>
                        {o.delivery_address && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{o.delivery_address}</p>}
                        <div className="mt-3 flex flex-col gap-2">
                          {(ACTIONS[o.status] ?? []).map((a) => (
                            <Button key={a.to} variant={a.variant ?? "primary"} loading={busy === o.id} onClick={() => move(o, a.to)} className="w-full py-2">
                              {a.label}
                            </Button>
                          ))}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {items.length === 0 && <p className="py-6 text-center text-xs text-slate-400">Nothing here</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
