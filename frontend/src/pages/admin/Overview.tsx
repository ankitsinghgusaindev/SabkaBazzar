import { motion } from "framer-motion";
import { ArrowRight, Building2, FileCheck2, IndianRupee, ReceiptText, ShieldCheck, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge, Card, PageHeader, Skeleton, Stat, statusTone } from "../../components/ui";
import { money, useFetch } from "../../lib/api";
import type { AdminOverview, ApplicationList } from "../../types";

export default function AdminOverviewPage() {
  const data = useFetch<AdminOverview>("/admin/overview", 60000);
  const apps = useFetch<ApplicationList>("/admin/applications?status=pending", 30000);
  const o = data.data;
  const orders = o ? Object.values(o.orders_by_status).reduce((a, b) => a + b, 0) : 0;
  const users = o ? Object.values(o.users_by_role).reduce((a, b) => a + b, 0) : 0;
  const pending = apps.data?.counts.pending ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Platform overview" subtitle="Growth, revenue and seller onboarding at a glance." />

      {pending > 0 && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 p-5 ring-1 ring-amber-200 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500 text-white"><FileCheck2 className="h-5 w-5" /></span>
            <div>
              <p className="font-bold text-amber-950">{pending} seller application{pending > 1 ? "s" : ""} waiting for review</p>
              <p className="text-sm text-amber-900/80">Verify documents to put these shops live for customers.</p>
            </div>
          </div>
          <Link to="/admin/applications" className="inline-flex items-center gap-1 text-sm font-semibold text-amber-800 hover:text-amber-950">
            Review now <ArrowRight className="h-4 w-4" />
          </Link>
        </motion.div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {o ? (
          <>
            <Stat icon={Users} label="Users" value={String(users)} hint={`${o.users_by_role.customer ?? 0} customers · ${o.users_by_role.shopkeeper ?? 0} sellers`} />
            <Stat icon={Building2} label="Shops onboarded" value={String(o.shops)} hint={`${pending} awaiting verification`} tone="sky" delay={0.05} />
            <Stat icon={IndianRupee} label="Gross merchandise value" value={money(o.gross_merchandise_value)} hint="Completed orders" tone="emerald" delay={0.1} />
            <Stat icon={ReceiptText} label="Orders" value={String(orders)} hint={`${o.orders_by_status.completed ?? 0} completed`} tone="violet" delay={0.15} />
          </>
        ) : Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="font-bold">Revenue, last 30 days</h2>
              <p className="text-xs text-slate-500">Completed orders per day</p>
            </div>
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
          </div>
          {!o ? <Skeleton className="h-56" /> : <RevenueBars points={o.daily_revenue_30d} />}
        </Card>

        <Card>
          <h2 className="mb-4 font-bold">Orders by status</h2>
          {!o ? <Skeleton className="h-56" /> : (
            <div className="space-y-4">
              {Object.entries(o.orders_by_status).sort((a, b) => b[1] - a[1]).map(([status, n], i) => (
                <div key={status}>
                  <div className="mb-1 flex justify-between text-sm">
                    <Badge tone={statusTone(status)}>{status}</Badge>
                    <span className="font-semibold">{n}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <motion.div className="h-full rounded-full gradient-brand" initial={{ width: 0 }}
                      animate={{ width: `${orders ? (n / orders) * 100 : 0}%` }} transition={{ duration: 0.7, delay: i * 0.08 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="mb-4 font-bold">Top shops by revenue</h2>
        {!o ? <Skeleton className="h-32" /> : o.top_shops.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">No completed orders yet.</p>
        ) : (
          <ol className="divide-y divide-slate-100">
            {o.top_shops.map((s, i) => (
              <motion.li key={s.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                className="flex items-center gap-4 py-3">
                <span className={`grid h-8 w-8 place-items-center rounded-full text-sm font-bold ${i === 0 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{i + 1}</span>
                <span className="flex-1 font-semibold">{s.name}</span>
                <span className="text-sm text-slate-500">★ {s.rating.toFixed(1)}</span>
                <span className="w-28 text-right font-bold">{money(s.revenue)}</span>
              </motion.li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

function RevenueBars({ points }: { points: { date: string; revenue: string; orders: number }[] }) {
  if (points.length === 0) return <p className="py-16 text-center text-sm text-slate-500">No revenue in the last 30 days.</p>;
  const max = Math.max(...points.map((p) => Number(p.revenue)), 1);
  return (
    <div className="flex h-56 items-end gap-1.5">
      {points.map((p, i) => {
        const pct = (Number(p.revenue) / max) * 100;
        return (
          <motion.div key={p.date} className="group relative flex h-full flex-1 flex-col justify-end" initial="rest" whileHover="hover">
            <motion.div
              className="rounded-t-md gradient-brand"
              initial={{ height: 0 }}
              animate={{ height: `${Math.max(pct, 2)}%` }}
              transition={{ duration: 0.6, delay: i * 0.02, ease: "easeOut" }}
              style={{ minHeight: 4 }}
            />
            <div className="pointer-events-none absolute -top-12 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg group-hover:block">
              <p className="font-semibold">{money(p.revenue)}</p>
              <p className="text-slate-300">{p.date} · {p.orders} orders</p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
