import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, FileText, Lock, MapPin, ShieldCheck, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logo, Navbar } from "../../components/Layout";
import { Button, Card, Field, inputClass, useToast } from "../../components/ui";
import { api, errorMessage, useFetch } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { Enrollment } from "../../types";

type DocKey = "pan_card" | "shop_license" | "owner_id" | "address_proof" | "bank_proof";
const DOCS: { key: DocKey; label: string; required: boolean; help: string }[] = [
  { key: "pan_card", label: "PAN card (owner or business)", required: true, help: "Clear scan or photo, PDF or JPG" },
  { key: "shop_license", label: "Shop & establishment / trade licence", required: true, help: "Current licence copy" },
  { key: "owner_id", label: "Owner ID (Aadhaar / Passport / Voter ID)", required: true, help: "Front side is enough" },
  { key: "address_proof", label: "Shop address proof", required: true, help: "Electricity bill, rent agreement, or GST certificate" },
  { key: "bank_proof", label: "Cancelled cheque or bank statement", required: false, help: "Helps us confirm payouts faster" },
];

interface Form {
  shop_name: string; legal_name: string; owner_full_name: string; address: string;
  lat: string; lng: string; radius: string;
  pan: string; gst: string; license: string; fssai: string;
  account: string; confirm_account: string; ifsc: string;
}
const EMPTY: Form = {
  shop_name: "", legal_name: "", owner_full_name: "", address: "", lat: "", lng: "", radius: "3",
  pan: "", gst: "", license: "", fssai: "", account: "", confirm_account: "", ifsc: "",
};
const STEPS = ["Business", "Legal & tax", "Settlement", "Documents"];

const isNum = (s: string) => s.trim() !== "" && !Number.isNaN(Number(s));

function validate(step: number, f: Form, files: Partial<Record<DocKey, File>>, decl: boolean[]): Record<string, string> {
  const e: Record<string, string> = {};
  if (step === 0) {
    if (f.shop_name.trim().length < 3) e.shop_name = "At least 3 characters";
    if (f.legal_name.trim().length < 3) e.legal_name = "Enter the name as registered with authorities";
    if (f.owner_full_name.trim().length < 3) e.owner_full_name = "Enter the owner's full name";
    if (f.address.trim().length < 10) e.address = "Enter the full shop address";
    if (!isNum(f.lat) || Math.abs(Number(f.lat)) > 90) e.lat = "Set your shop location";
    if (!isNum(f.lng) || Math.abs(Number(f.lng)) > 180) e.lng = "Set your shop location";
    const r = Number(f.radius);
    if (!isNum(f.radius) || r <= 0 || r > 20) e.radius = "Between 0.5 and 20 km";
  }
  if (step === 1) {
    if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(f.pan.toUpperCase())) e.pan = "Format: ABCDE1234F";
    if (f.gst && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(f.gst.toUpperCase())) e.gst = "Invalid GST format (15 characters)";
    if (f.license.trim().length < 3) e.license = "Enter your licence number";
    if (f.fssai && !/^\d{14}$/.test(f.fssai)) e.fssai = "FSSAI must be 14 digits";
  }
  if (step === 2) {
    if (!/^\d{9,18}$/.test(f.account.replace(/\s/g, ""))) e.account = "9 to 18 digits";
    if (f.confirm_account.replace(/\s/g, "") !== f.account.replace(/\s/g, "")) e.confirm_account = "Account numbers do not match";
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(f.ifsc.toUpperCase())) e.ifsc = "Format: HDFC0001234";
  }
  if (step === 3) {
    DOCS.filter((d) => d.required && !files[d.key]).forEach((d) => { e[d.key] = "Required"; });
    if (!decl.every(Boolean)) e.declaration = "Please accept all three declarations";
  }
  return e;
}

export default function Enrollment() {
  const { me, refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const existing = useFetch<Enrollment>("/shop/enrollment");

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [form, setForm] = useState<Form>(EMPTY);
  const [files, setFiles] = useState<Partial<Record<DocKey, File>>>({});
  const [decl, setDecl] = useState<boolean[]>([false, false, false]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  // Resubmission after rejection: prefill everything except bank details
  useEffect(() => {
    const d = existing.data;
    if (!d || prefilled) return;
    setForm((f) => ({
      ...f,
      shop_name: d.shop_name, legal_name: d.legal_name, owner_full_name: d.owner_full_name,
      address: d.address, lat: String(d.lat), lng: String(d.lng), radius: String(d.delivery_radius_km),
      pan: d.pan_number, gst: d.gst_number ?? "", license: d.shop_license_number, fssai: d.fssai_number ?? "",
      ifsc: d.bank_ifsc,
    }));
    setPrefilled(true);
  }, [existing.data, prefilled]);

  const set = (key: keyof Form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  function useMyLocation() {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        set("lat", pos.coords.latitude.toFixed(6));
        set("lng", pos.coords.longitude.toFixed(6));
        toast("Location captured");
      },
      () => toast("Could not read your location. Enter coordinates manually.", "error"),
      { enableHighAccuracy: true },
    );
  }

  function next() {
    const e = validate(step, form, files, decl);
    setErrors(e);
    if (Object.keys(e).length) {
      toast("Please fix the highlighted fields", "error");
      return;
    }
    setDir(1);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setErrors({});
    setDir(-1);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function submit() {
    const e = validate(3, form, files, decl);
    setErrors(e);
    if (Object.keys(e).length) return;
    setSubmitting(true);
    try {
      await api("/shop/enrollment", {
        method: "POST",
        body: JSON.stringify({
          shop_name: form.shop_name.trim(),
          legal_name: form.legal_name.trim(),
          owner_full_name: form.owner_full_name.trim(),
          address: form.address.trim(),
          lat: Number(form.lat),
          lng: Number(form.lng),
          delivery_radius_km: Number(form.radius),
          pan_number: form.pan,
          gst_number: form.gst || null,
          shop_license_number: form.license.trim(),
          fssai_number: form.fssai || null,
          bank_account_number: form.account.replace(/\s/g, ""),
          bank_ifsc: form.ifsc,
          // Only file names are sent for now. Real uploads need object storage (e.g. S3).
          documents: (Object.keys(files) as DocKey[]).map((k) => `${k}:${files[k]!.name}`),
          declaration_accepted: decl.every(Boolean),
        }),
      });
      await refresh();
      toast("Enrollment submitted. We'll notify you once verified.");
      navigate("/seller", { replace: true });
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSubmitting(false);
    }
  }

  const progress = ((step + 1) / STEPS.length) * 100;
  const rejected = existing.data?.verification_status === "rejected";

  return (
    <div className="min-h-screen">
      <Navbar portal="Seller enrollment" />
      <div className="mx-auto max-w-3xl px-4 py-8">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-extrabold tracking-tight">
            {rejected ? "Update your application" : "Set up your shop"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {me?.name.split(" ")[0] ? `Hi ${me.name.split(" ")[0]}, ` : ""}these details are required by law and used only to verify your business.
          </p>
          {rejected && existing.data?.rejection_reason && (
            <div className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">
              <strong>Reviewer note:</strong> {existing.data.rejection_reason}
            </div>
          )}
        </motion.div>

        {/* Stepper */}
        <div className="mt-6">
          <div className="flex items-center justify-between">
            {STEPS.map((label, i) => (
              <div key={label} className="flex flex-col items-center gap-1.5">
                <motion.span
                  animate={{ scale: i === step ? 1.1 : 1, backgroundColor: i <= step ? "#f97316" : "#e2e8f0" }}
                  className="grid h-8 w-8 place-items-center rounded-full text-xs font-bold text-white"
                >
                  {i < step ? <Check className="h-4 w-4" /> : i + 1}
                </motion.span>
                <span className={`hidden text-xs font-semibold sm:block ${i <= step ? "text-slate-800" : "text-slate-400"}`}>{label}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <motion.div className="h-full gradient-brand" animate={{ width: `${progress}%` }} transition={{ duration: 0.4 }} />
          </div>
        </div>

        <Card className="mt-6 overflow-hidden p-6 sm:p-8">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={step}
              custom={dir}
              initial={{ opacity: 0, x: dir * 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -40 }}
              transition={{ duration: 0.25 }}
              className="space-y-5"
            >
              {step === 0 && (
                <>
                  <Field label="Shop display name" error={errors.shop_name} hint="What customers will see, e.g. Sharma General Store">
                    <input className={inputClass} value={form.shop_name} onChange={(e) => set("shop_name", e.target.value)} />
                  </Field>
                  <Field label="Legal business name" error={errors.legal_name} hint="Exactly as on your PAN / registration">
                    <input className={inputClass} value={form.legal_name} onChange={(e) => set("legal_name", e.target.value)} />
                  </Field>
                  <Field label="Owner's full name" error={errors.owner_full_name}>
                    <input className={inputClass} value={form.owner_full_name} onChange={(e) => set("owner_full_name", e.target.value)} />
                  </Field>
                  <Field label="Shop address" error={errors.address}>
                    <textarea rows={3} className={inputClass} value={form.address} onChange={(e) => set("address", e.target.value)} />
                  </Field>
                  <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700"><MapPin className="h-4 w-4 text-brand-600" /> Shop location</div>
                      <Button type="button" variant="secondary" onClick={useMyLocation}>Use my current location</Button>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <Field label="Latitude" error={errors.lat}><input className={inputClass} value={form.lat} onChange={(e) => set("lat", e.target.value)} /></Field>
                      <Field label="Longitude" error={errors.lng}><input className={inputClass} value={form.lng} onChange={(e) => set("lng", e.target.value)} /></Field>
                    </div>
                  </div>
                  <Field label="Delivery radius (km)" error={errors.radius} hint="How far you're willing to deliver from the shop">
                    <input type="range" min={0.5} max={10} step={0.5} value={Number(form.radius) || 3} onChange={(e) => set("radius", e.target.value)} className="w-full accent-brand-500" />
                    <span className="text-sm font-semibold text-brand-700">{form.radius || 3} km</span>
                  </Field>
                </>
              )}

              {step === 1 && (
                <>
                  <Field label="PAN number" error={errors.pan} hint="Business or owner PAN">
                    <input className={`${inputClass} uppercase`} maxLength={10} value={form.pan} onChange={(e) => set("pan", e.target.value.toUpperCase())} />
                  </Field>
                  <Field label="GST number (optional)" error={errors.gst} hint="Required if your turnover is above the GST threshold">
                    <input className={`${inputClass} uppercase`} maxLength={15} value={form.gst} onChange={(e) => set("gst", e.target.value.toUpperCase())} />
                  </Field>
                  <Field label="Shop licence / registration number" error={errors.license} hint="Shop & establishment, trade licence or Udyam number">
                    <input className={inputClass} value={form.license} onChange={(e) => set("license", e.target.value)} />
                  </Field>
                  <Field label="FSSAI licence (optional)" error={errors.fssai} hint="Needed if you sell food items">
                    <input className={inputClass} maxLength={14} inputMode="numeric" value={form.fssai} onChange={(e) => set("fssai", e.target.value.replace(/\D/g, ""))} />
                  </Field>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="flex items-start gap-3 rounded-xl bg-sky-50 p-4 text-sm text-sky-800 ring-1 ring-sky-200">
                    <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                    Your settlements go to this account. Double-check the number, since mistakes delay payouts.
                  </div>
                  <Field label="Account number" error={errors.account}>
                    <input className={inputClass} inputMode="numeric" value={form.account} onChange={(e) => set("account", e.target.value.replace(/\D/g, ""))} />
                  </Field>
                  <Field label="Re-enter account number" error={errors.confirm_account}>
                    <input className={inputClass} inputMode="numeric" value={form.confirm_account} onChange={(e) => set("confirm_account", e.target.value.replace(/\D/g, ""))} />
                  </Field>
                  <Field label="IFSC code" error={errors.ifsc} hint="11 characters, e.g. HDFC0001234">
                    <input className={`${inputClass} uppercase`} maxLength={11} value={form.ifsc} onChange={(e) => set("ifsc", e.target.value.toUpperCase())} />
                  </Field>
                </>
              )}

              {step === 3 && (
                <>
                  <div className="space-y-3">
                    {DOCS.map((d) => (
                      <motion.label
                        key={d.key}
                        whileHover={{ scale: 1.005 }}
                        className={`flex cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed p-4 transition ${files[d.key] ? "border-emerald-300 bg-emerald-50/50" : errors[d.key] ? "border-rose-300" : "border-slate-200 hover:border-brand-300"}`}
                      >
                        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${files[d.key] ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
                          {files[d.key] ? <Check className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-slate-800">
                            {d.label} {d.required ? <span className="text-rose-500">*</span> : <span className="text-xs font-normal text-slate-400">(optional)</span>}
                          </span>
                          <span className="block truncate text-xs text-slate-500">{files[d.key]?.name ?? d.help}</span>
                          {errors[d.key] && <span className="text-xs font-medium text-rose-600">{errors[d.key]}</span>}
                        </span>
                        <Upload className="h-4 w-4 text-slate-400" />
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="sr-only"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            setFiles((f) => {
                              const copy = { ...f };
                              if (file) copy[d.key] = file; else delete copy[d.key];
                              return copy;
                            });
                          }} />
                      </motion.label>
                    ))}
                  </div>

                  <div className="space-y-3 rounded-2xl bg-slate-50 p-5 ring-1 ring-slate-200">
                    <p className="flex items-center gap-2 text-sm font-bold text-slate-800"><ShieldCheck className="h-4 w-4 text-brand-600" /> Declarations</p>
                    {[
                      "I confirm that all details and documents I have provided are true, correct and belong to my business.",
                      "I authorise SabkaBazzar to verify these details with government records and my bank.",
                      "I agree to the Seller Terms, the commission policy and the Privacy Policy.",
                    ].map((text, i) => (
                      <label key={text} className="flex cursor-pointer items-start gap-3 text-sm text-slate-700">
                        <input type="checkbox" className="mt-1 h-4 w-4 accent-brand-500" checked={decl[i]}
                          onChange={(e) => setDecl((d) => d.map((v, j) => (j === i ? e.target.checked : v)))} />
                        {text}
                      </label>
                    ))}
                    {errors.declaration && <p className="text-xs font-medium text-rose-600">{errors.declaration}</p>}
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="mt-8 flex items-center justify-between gap-3 border-t border-slate-100 pt-6">
            <Button variant="ghost" onClick={back} disabled={step === 0 || submitting}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={next}>Continue <ArrowRight className="h-4 w-4" /></Button>
            ) : (
              <Button onClick={submit} loading={submitting}>Submit for verification</Button>
            )}
          </div>
        </Card>

        <div className="mt-6 flex flex-col items-center gap-2 text-center text-xs text-slate-400">
          <Logo to="/seller" />
          <span>Verification usually takes 24 to 48 hours.</span>
        </div>
      </div>
    </div>
  );
}
