import { motion } from "framer-motion";
import { ArrowRight, Clock, IndianRupee, ShieldAlert, ShoppingBag, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, Empty, PageHeader, Skeleton, Stars, Stat, statusTone, useToast } from "../../components/ui";
import { api, errorMessage, money, timeAgo, useFetch } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { Dashboard, Order } from "../../types";

export default function SellerDashboard() {
  const { me, refresh } = useAuth();
  const toast = useToast();
  const verified = me?.shop?.verification_status === "verified";
  const dash = useFetch<Dashboard>("/shop/dashboard", 15000);
  const orders = useFetch<Order[]>("/shop/orders", 10000);
  const d = dash.data;

  async function toggleOpen() {
    if (!me?.shop) return;
    try {
      await api("/shop/me", { method: "PATCH", body: JSON.stringify({ is_open: !me.shop.is_open }) });
      await refresh();
      toast(me.shop.is_open ? "Shop is now closed" : "Shop is now open for orders");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Namaste, ${me?.name.split(" ")[0]}`}
        subtitle={me?.shop?.name}
        action={verified && me?.shop ? (
          <Button variant="secondary" onClick={toggleOpen}>
            <span className={`h-2 w-2 rounded-full ${me.shop.is_open ? "bg-emerald-500" : "bg-slate-400"}`} />
            {me.shop.is_open ? "Shop open · Close" : "Shop closed · Open"}
          </Button>
        ) : null}
      />

      {!verified && <VerificationBanner status={me?.shop?.verification_status ?? "pending"} reason={me?.shop?.rejection_reason ?? null} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {d ? (
          <>
            <Stat icon={IndianRupee} label="Revenue today" value={money(d.revenue_today.revenue)} hint={`${d.revenue_today.orders} completed orders`} delay={0} />
            <Stat icon={ShoppingBag} label="Last 7 days" value={money(d.revenue_7d.revenue)} hint={`${d.revenue_7d.orders} completed orders`} tone="sky" delay={0.05} />
            <Stat icon={Clock} label="Pending orders" value={String(d.pending_orders)} hint="Need your action" tone="violet" delay={0.1} />
            <Stat icon={Users} label="Customers" value={String(d.customers)} hint={`${Math.round(d.cancel_rate * 100)}% of orders cancelled`} tone="emerald" delay={0.15} />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold">Live orders</h2>
            <Link to="/seller/orders" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700">
              Open order board <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {orders.loading ? (
            <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : orders.data && orders.data.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {orders.data.slice(0, 5).map((o, i) => (
                <motion.li key={o.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                  className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold">Order #{o.id} <span className="font-normal text-slate-500">· {o.fulfilment}</span></p>
                    <p className="truncate text-sm text-slate-500">{o.items.map((it) => `${it.name} × ${it.quantity}`).join(", ")}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{money(o.total)}</p>
                    <div className="mt-1 flex items-center justify-end gap-2"><Badge tone={statusTone(o.status)}>{o.status}</Badge></div>
                    <p className="mt-1 text-xs text-slate-400">{timeAgo(o.created_at)}</p>
                  </div>
                </motion.li>
              ))}
            </ul>
          ) : (
            <Empty icon={ShoppingBag} title="No active orders" body="New orders appear here instantly." />
          )}
        </Card>

        <Card>
          <h2 className="mb-4 font-bold">Shop health</h2>
          <div className="space-y-5">
            <div>
              <p className="text-sm text-slate-500">Shop rating</p>
              <div className="mt-1 flex items-center gap-3">
                <Stars value={d?.shop_rating.avg ?? 0} size="h-4 w-4" />
                <span className="font-bold">{(d?.shop_rating.avg ?? 0).toFixed(1)}</span>
                <span className="text-xs text-slate-400">({d?.shop_rating.count ?? 0})</span>
              </div>
            </div>
            <div>
              <p className="text-sm text-slate-500">Delivery rating</p>
              <div className="mt-1 flex items-center gap-3">
                <Stars value={d?.delivery_rating.avg ?? 0} size="h-4 w-4" />
                <span className="font-bold">{(d?.delivery_rating.avg ?? 0).toFixed(1)}</span>
                <span className="text-xs text-slate-400">({d?.delivery_rating.count ?? 0})</span>
              </div>
            </div>
            <div>
              <p className="text-sm text-slate-500">Lifetime revenue</p>
              <p className="mt-1 text-xl font-extrabold">{money(d?.revenue_all.revenue ?? 0)}</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function VerificationBanner({ status, reason }: { status: string; reason: string | null }) {
  if (status === "rejected") {
    return (
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 rounded-2xl border border-rose-200 bg-rose-50 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-rose-600" />
          <div>
            <p className="font-bold text-rose-900">Your application needs changes</p>
            <p className="text-sm text-rose-800">{reason ?? "Please review your details and resubmit."}</p>
          </div>
        </div>
        <Link to="/seller/enroll"><Button variant="danger">Update and resubmit</Button></Link>
      </motion.div>
    );
  }
  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-5">
      <div className="flex items-start gap-4">
        <span className="relative mt-1 flex h-3 w-3 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-amber-400" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500" />
        </span>
        <div>
          <p className="font-bold text-amber-950">Verification in progress</p>
          <p className="mt-1 text-sm text-amber-900/80">
            Our team is checking your documents. Your shop goes live for customers once approved, usually within 24 to 48 hours.
            You can already add products while you wait.
          </p>
          <ol className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
            {["Submitted", "Under review", "Live on SabkaBazzar"].map((s, i) => (
              <li key={s} className={`rounded-full px-3 py-1 ${i <= 1 ? "bg-amber-600 text-white" : "bg-white text-amber-800 ring-1 ring-amber-200"}`}>{s}</li>
            ))}
          </ol>
        </div>
      </div>
    </motion.div>
  );
}
