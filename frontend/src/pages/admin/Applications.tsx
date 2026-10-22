import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, FileCheck2, MapPin, Phone } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Empty, PageHeader, Skeleton, statusTone } from "../../components/ui";
import { timeAgo, useFetch } from "../../lib/api";
import type { ApplicationList } from "../../types";

const TABS = ["pending", "verified", "rejected", "all"] as const;

export default function Applications() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("pending");
  const navigate = useNavigate();
  const list = useFetch<ApplicationList>(`/admin/applications?status=${tab}`, 20000);

  return (
    <div className="space-y-6">
      <PageHeader title="Seller applications" subtitle="Verify legal and bank details. Approved shops go live immediately." />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`relative shrink-0 rounded-full px-4 py-2 text-sm font-semibold capitalize transition ${tab === t ? "text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>
            {tab === t && <motion.span layoutId="app-tab" className="absolute inset-0 rounded-full gradient-brand" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
            <span className="relative">{t} {list.data && <span className="opacity-70">({list.data.counts[t]})</span>}</span>
          </button>
        ))}
      </div>

      {list.loading && !list.data ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : !list.data?.items.length ? (
        <Empty icon={FileCheck2} title={`No ${tab === "all" ? "" : tab} applications`} body="New seller applications will show up here." />
      ) : (
        <AnimatePresence mode="popLayout">
          <div className="space-y-3">
            {list.data.items.map((a, i) => (
              <motion.button key={a.shop_id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                whileHover={{ x: 4 }} onClick={() => navigate(`/admin/applications/${a.shop_id}`)}
                className="card flex w-full items-center gap-4 p-5 text-left transition hover:border-brand-300">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-slate-900">{a.shop_name}</p>
                    <Badge tone={statusTone(a.verification_status)}>{a.verification_status}</Badge>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-slate-500">{a.legal_name} · Owner: {a.owner_name}</p>
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {a.owner_phone}</span>
                    <span className="inline-flex max-w-xs items-center gap-1 truncate"><MapPin className="h-3 w-3" /> {a.address}</span>
                    <span>Submitted {timeAgo(a.submitted_at)}</span>
                  </div>
                  {a.rejection_reason && <p className="mt-2 text-xs text-rose-600">Reason: {a.rejection_reason}</p>}
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
              </motion.button>
            ))}
          </div>
        </AnimatePresence>
      )}
    </div>
  );
}
