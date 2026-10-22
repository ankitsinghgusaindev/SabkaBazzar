import { motion } from "framer-motion";
import { Check, Copy, MapPin, Store, Users } from "lucide-react";
import { useState } from "react";
import { Badge, Card, Empty, PageHeader, Skeleton, Switch, Button, statusTone, useToast, Field, inputClass } from "../../components/ui";
import { api, errorMessage, useFetch } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { CustomerRow, MyShop } from "../../types";

export default function ShopSettings() {
  const { me, refresh } = useAuth();
  const toast = useToast();
  const shop = useFetch<MyShop>("/shop/me");
  const customers = useFetch<CustomerRow[]>("/shop/customers", 30000);
  const [copied, setCopied] = useState(false);

  async function patch(body: Record<string, unknown>, message: string) {
    try {
      await api("/shop/me", { method: "PATCH", body: JSON.stringify(body) });
      shop.reload();
      refresh();
      toast(message);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  async function bind(customer: CustomerRow, exclusive: boolean) {
    try {
      await api(`/shop/customers/${customer.customer_id}`, { method: "PATCH", body: JSON.stringify({ exclusive }) });
      customers.reload();
      toast(exclusive ? `${customer.name} is now bound to your shop` : `${customer.name} can shop elsewhere again`);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  async function copyCode(code: string) {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const s = shop.data;
  const verified = me?.shop?.verification_status === "verified";

  return (
    <div className="space-y-6">
      <PageHeader title="My shop" subtitle="Control visibility, delivery and your customer network." />

      {shop.loading || !s ? <Skeleton className="h-72" /> : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-xl gradient-brand text-white"><Store className="h-6 w-6" /></span>
                <div>
                  <h2 className="text-lg font-bold">{s.name}</h2>
                  <p className="flex items-center gap-1 text-sm text-slate-500"><MapPin className="h-3.5 w-3.5" /> {s.address}</p>
                </div>
              </div>
              <Badge tone={statusTone(s.verification_status)}>{s.verification_status}</Badge>
            </div>

            <div className="divide-y divide-slate-100">
              <Switch
                checked={s.is_open}
                disabled={!verified}
                onChange={(v) => patch({ is_open: v }, v ? "Shop is open" : "Shop is closed")}
                label="Accepting orders"
                description={verified ? "Turn off when you're away. Customers won't be able to order." : "Available after verification."}
              />
              <Switch
                checked={s.members_only}
                onChange={(v) => patch({ members_only: v }, v ? "Only your members can see the shop" : "Shop is visible to everyone nearby")}
                label="Members only"
                description="Hide your shop from non-members. Customers join with your invite code."
              />
            </div>

            <DeliveryRadius key={s.delivery_radius_km} initial={s.delivery_radius_km} onSave={(km) => patch({ delivery_radius_km: km }, `Delivery range set to ${km} km`)} />
          </Card>

          <Card className="flex flex-col">
            <p className="text-sm font-semibold text-slate-500">Customer invite code</p>
            <motion.p key={s.invite_code} initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="mt-2 rounded-xl bg-brand-50 py-4 text-center font-mono text-2xl font-extrabold tracking-[0.3em] text-brand-700">
              {s.invite_code}
            </motion.p>
            <Button variant="secondary" className="mt-4 w-full" onClick={() => copyCode(s.invite_code)}>
              {copied ? <><Check className="h-4 w-4 text-emerald-600" /> Copied</> : <><Copy className="h-4 w-4" /> Copy code</>}
            </Button>
            <p className="mt-3 text-xs text-slate-500">Print it at your counter or share it on WhatsApp. Regular customers can join in seconds.</p>
          </Card>
        </div>
      )}

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2"><Users className="h-5 w-5 text-brand-600" /><h2 className="font-bold">My customers</h2></div>
          <span className="text-sm text-slate-500">{customers.data?.length ?? 0} members</span>
        </div>
        {customers.loading ? <Skeleton className="h-24" /> : !customers.data?.length ? (
          <Empty icon={Users} title="No members yet" body="Share your invite code to start building your customer network." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {customers.data.map((c, i) => (
              <motion.li key={c.customer_id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-xs text-slate-500">{c.phone} · {c.completed_orders} completed orders · ₹{Number(c.total_spend).toFixed(0)} spent</p>
                </div>
                <Switch checked={c.exclusive} onChange={(v) => bind(c, v)} label="Bound to my shop" />
              </motion.li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-slate-500">Bound customers can only place orders with your shop.</p>
      </Card>
    </div>
  );
}

function DeliveryRadius({ initial, onSave }: { initial: number; onSave: (km: number) => void }) {
  const [km, setKm] = useState(initial);
  const changed = km !== initial;
  return (
    <Field label={`Delivery radius: ${km} km`} hint="Customers outside this range can only pick up.">
      <input type="range" min={0.5} max={20} step={0.5} value={km} onChange={(e) => setKm(Number(e.target.value))} className="w-full accent-brand-500" />
      {changed && (
        <div className="mt-3 flex gap-2">
          <Button onClick={() => onSave(km)}>Save range</Button>
          <Button variant="ghost" onClick={() => setKm(initial)}>Reset</Button>
        </div>
      )}
    </Field>
  );
}
