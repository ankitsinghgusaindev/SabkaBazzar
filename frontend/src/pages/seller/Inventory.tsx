import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Minus, Package, Pencil, Plus, Search } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Badge, Button, Empty, Field, Modal, PageHeader, Skeleton, Switch, inputClass, useToast } from "../../components/ui";
import { api, errorMessage, money, useFetch } from "../../lib/api";
import type { InventoryResponse, Product } from "../../types";

export default function Inventory() {
  const inv = useFetch<InventoryResponse>("/shop/inventory", 30000);
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [editing, setEditing] = useState<Product | null>(null);
  const [adding, setAdding] = useState(false);

  const all = useMemo(() => inv.data?.categories.flatMap((c) => c.products) ?? [], [inv.data]);
  const categories = ["All", ...(inv.data?.categories.map((c) => c.name) ?? [])];
  const lowStock = new Set(inv.data?.low_stock ?? []);
  const shown = all.filter(
    (p) => (category === "All" || p.category === category) && p.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  async function adjust(p: Product, qty: number) {
    try {
      await api(`/shop/products/${p.id}/restock`, {
        method: "POST",
        body: JSON.stringify({ quantity: qty, reason: qty > 0 ? "restock" : "correction" }),
      });
      inv.reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        subtitle={`${all.length} products across ${inv.data?.categories.length ?? 0} categories`}
        action={<Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add product</Button>}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className={`${inputClass} pl-10`} placeholder="Search products" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {categories.map((c) => (
          <button key={c} onClick={() => setCategory(c)} className={`relative shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition ${category === c ? "text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>
            {category === c && <motion.span layoutId="cat-pill" className="absolute inset-0 rounded-full gradient-brand" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
            <span className="relative">{c}</span>
          </button>
        ))}
      </div>

      {inv.loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-44" />)}</div>
      ) : shown.length === 0 ? (
        <Empty icon={Package} title={all.length ? "No products match" : "No products yet"} body={all.length ? "Try another search or category." : "Add your first product to start selling."}
          action={!all.length ? <Button onClick={() => setAdding(true)}>Add first product</Button> : undefined} />
      ) : (
        <motion.div layout className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence>
            {shown.map((p) => {
              const level = p.stock <= 5 ? "bg-rose-500" : p.stock <= 15 ? "bg-amber-400" : "bg-emerald-500";
              return (
                <motion.div key={p.id} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
                  className={`card flex flex-col p-5 ${p.is_active === false ? "opacity-60" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-bold">{p.name}</p>
                      <p className="text-xs text-slate-500">{p.unit}</p>
                    </div>
                    <button onClick={() => setEditing(p)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label={`Edit ${p.name}`}>
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone="brand">{p.category}</Badge>
                    {lowStock.has(p.name) && <Badge tone="red"><AlertTriangle className="h-3 w-3" /> Low stock</Badge>}
                    {p.is_active === false && <Badge tone="slate">Hidden</Badge>}
                  </div>
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="text-xl font-extrabold">{money(p.price)}</span>
                    {p.discount_percent > 0 && <><span className="text-sm text-slate-400 line-through">{money(p.list_price)}</span><Badge tone="green">{p.discount_percent}% off</Badge></>}
                  </div>

                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-slate-500"><span>Stock</span><span className="font-semibold text-slate-700">{p.stock}</span></div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                      <motion.div className={`h-full rounded-full ${level}`} initial={{ width: 0 }} animate={{ width: `${Math.min(100, (p.stock / 50) * 100)}%` }} transition={{ duration: 0.6 }} />
                    </div>
                  </div>

                  <div className="mt-auto flex items-center gap-2 pt-4">
                    <Button variant="secondary" className="px-2.5 py-2" onClick={() => adjust(p, -1)} disabled={p.stock === 0} aria-label="Remove one"><Minus className="h-4 w-4" /></Button>
                    <Button variant="secondary" className="flex-1 py-2" onClick={() => adjust(p, 10)}>+10 restock</Button>
                    <Button variant="secondary" className="px-2.5 py-2" onClick={() => adjust(p, 1)} aria-label="Add one"><Plus className="h-4 w-4" /></Button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}

      <ProductModal
        open={adding}
        categories={categories.filter((c) => c !== "All")}
        onClose={() => setAdding(false)}
        onSaved={() => { setAdding(false); toast("Product added"); inv.reload(); }}
      />
      <ProductModal
        open={editing !== null}
        product={editing ?? undefined}
        categories={categories.filter((c) => c !== "All")}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); toast("Product updated"); inv.reload(); }}
      />
    </div>
  );
}

function ProductModal({ open, product, categories, onClose, onSaved }: {
  open: boolean; product?: Product; categories: string[]; onClose: () => void; onSaved: () => void;
}) {
  const editMode = !!product;
  const [form, setForm] = useState({ name: "", category: "", unit: "", price: "", stock: "0", discount: "0", active: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  // Reset form whenever the modal opens for a different product
  const key = open ? (product?.id ?? "new") : "closed";
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setErrors({});
    setForm(product
      ? { name: product.name, category: product.category, unit: product.unit, price: product.list_price, stock: String(product.stock), discount: String(product.discount_percent), active: product.is_active !== false }
      : { name: "", category: "", unit: "", price: "", stock: "", discount: "0", active: true });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = "Required";
    if (!form.category.trim()) next.category = "Required";
    if (!form.unit.trim()) next.unit = "e.g. 1 kg, 500 ml, 1 pack";
    if (!(Number(form.price) > 0)) next.price = "Enter a price above 0";
    if (!editMode && !(Number(form.stock) >= 0)) next.stock = "Enter the stock you have";
    const d = Number(form.discount);
    if (!(d >= 0 && d <= 90)) next.discount = "Between 0 and 90";
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      if (editMode && product) {
        await api(`/shop/products/${product.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: form.name.trim(), category: form.category.trim(), price: form.price, discount_percent: d, is_active: form.active }),
        });
      } else {
        await api("/shop/products", {
          method: "POST",
          body: JSON.stringify({ name: form.name.trim(), category: form.category.trim(), unit: form.unit.trim(), price: form.price, stock: Number(form.stock), discount_percent: d }),
        });
      }
      onSaved();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editMode ? "Edit product" : "Add product"}>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2"><Field label="Product name" error={errors.name}><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field></div>
        <Field label="Category" error={errors.category}>
          <input className={inputClass} list="categories" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <datalist id="categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Unit" error={errors.unit} hint={editMode ? "Unit can't be changed after creation" : undefined}>
          <input className={inputClass} disabled={editMode} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="1 kg" />
        </Field>
        <Field label="Price (₹)" error={errors.price}><input className={inputClass} inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field>
        <Field label="Discount %" error={errors.discount}><input className={inputClass} inputMode="numeric" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} /></Field>
        {!editMode && (
          <div className="sm:col-span-2"><Field label="Opening stock" error={errors.stock}><input className={inputClass} inputMode="numeric" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></Field></div>
        )}
        {editMode && (
          <div className="sm:col-span-2 rounded-xl bg-slate-50 px-4 ring-1 ring-slate-200">
            <Switch checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label="Show to customers" description="Hidden products stay in your inventory but can't be ordered." />
          </div>
        )}
        <div className="sm:col-span-2 mt-2 flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>{editMode ? "Save changes" : "Add product"}</Button>
        </div>
      </form>
    </Modal>
  );
}
