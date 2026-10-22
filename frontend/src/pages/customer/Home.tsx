import { AnimatePresence, motion } from "framer-motion";
import { Compass, Hash, MapPin, Search, Star, Truck, Store, X, Loader2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Empty, Modal, Skeleton, inputClass, useToast } from "../../components/ui";
import { api, errorMessage, useFetch } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useLiveLocation } from "../../lib/useLiveLocation";
import type { NearbyShop } from "../../types";

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } };

export default function CustomerHome() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { coords, error: geoError } = useLiveLocation(true);
  const [query, setQuery] = useState("");
  const [joinOpen, setJoinOpen] = useState(false);

  // Round coordinates so small GPS jitter doesn't refetch on every tick
  const path = coords ? `/shops/nearby?lat=${coords.lat.toFixed(3)}&lng=${coords.lng.toFixed(3)}&radius_km=5` : null;
  const shops = useFetch<NearbyShop[]>(path, 60000);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (shops.data ?? []).filter((s) => !q || s.name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q));
  }, [shops.data, query]);

  return (
    <div className="space-y-6">
      <motion.section initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl gradient-brand p-6 text-white sm:p-8">
        <motion.div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/15 blur-2xl"
          animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 6, repeat: Infinity }} />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-white/80">Hello, {me?.name.split(" ")[0]}</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">Shops near you</h1>
            <LocationChip ready={!!coords} error={geoError} />
          </div>
          <Button variant="secondary" onClick={() => setJoinOpen(true)} className="self-start !bg-white/15 !text-white !ring-white/30 hover:!bg-white/25 sm:self-auto">
            <Hash className="h-4 w-4" /> Join a shop
          </Button>
        </div>
        <div className="relative mt-6">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className={`${inputClass} border-0 py-3 pl-11 text-slate-800`} placeholder="Search shops or areas"
            value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </motion.section>

      {!coords && !geoError && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40" />)}</div>
      )}

      {coords && shops.loading && !shops.data && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40" />)}</div>
      )}

      {coords && shops.data && visible.length === 0 && (
        <Empty icon={Compass} title="No verified shops within 5 km yet"
          body="Shops appear here once they are verified. Try a bigger area or join a shop with an invite code." />
      )}

      {visible.length > 0 && (
        <motion.div variants={container} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence>
            {visible.map((s) => (
              <motion.button key={s.id} variants={item} layout whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }}
                onClick={() => navigate(`/customer/shop/${s.id}`)}
                className="card group p-5 text-left transition hover:shadow-lg hover:shadow-brand-500/10">
                <div className="flex items-start gap-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-100 text-lg font-extrabold text-brand-700 transition group-hover:gradient-brand group-hover:text-white">
                    {s.name[0]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-slate-900">{s.name}</p>
                    <p className="line-clamp-1 text-xs text-slate-500">{s.address}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge tone="brand"><MapPin className="h-3 w-3" /> {s.distance_km} km</Badge>
                  <Badge tone="amber"><Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {s.shop_rating.toFixed(1)} ({s.shop_rating_count})</Badge>
                  {s.delivers_to_you ? <Badge tone="green"><Truck className="h-3 w-3" /> Delivers</Badge> : <Badge tone="slate"><Store className="h-3 w-3" /> Pickup</Badge>}
                  {s.is_member && <Badge tone="violet">Member</Badge>}
                  {!s.is_open && <Badge tone="red">Closed</Badge>}
                </div>
              </motion.button>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <JoinModal open={joinOpen} onClose={() => setJoinOpen(false)} onJoined={(name) => {
        setJoinOpen(false);
        toast(`You're now a member of ${name}`);
        shops.reload();
      }} />
    </div>
  );
}

function LocationChip({ ready, error }: { ready: boolean; error: string | null }) {
  if (error) return <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">Location unavailable: {error}</p>;
  return (
    <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
      <span className="relative flex h-2.5 w-2.5">
        <span className={`absolute inline-flex h-full w-full rounded-full ${ready ? "animate-pulse-ring bg-emerald-300" : "bg-amber-200"}`} />
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${ready ? "bg-emerald-300" : "bg-amber-200"}`} />
      </span>
      {ready ? "Live location on" : "Finding your location…"}
    </p>
  );
}

function JoinModal({ open, onClose, onJoined }: { open: boolean; onClose: () => void; onJoined: (name: string) => void }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  async function join(e: FormEvent) {
    e.preventDefault();
    if (code.trim().length < 4) return;
    setLoading(true);
    try {
      const res = await api<{ name: string }>("/shops/join", { method: "POST", body: JSON.stringify({ invite_code: code.trim() }) });
      setCode("");
      onJoined(res.name);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Join a shop">
      <form onSubmit={join} className="space-y-4">
        <p className="text-sm text-slate-500">Ask the shopkeeper for their invite code. Members can see members-only shops and get bound offers.</p>
        <input className={`${inputClass} text-center font-mono text-lg uppercase tracking-[0.3em]`} placeholder="ABCD1234" maxLength={12}
          value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoFocus />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}><X className="h-4 w-4" /> Cancel</Button>
          <Button type="submit" loading={loading} disabled={code.trim().length < 4}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Join
          </Button>
        </div>
      </form>
    </Modal>
  );
}
