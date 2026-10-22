import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Eye, EyeOff, ShoppingBag, Store, User, Phone, Lock, Check } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthShell } from "../../components/Layout";
import { Button, Field, inputClass } from "../../components/ui";
import { errorMessage } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../components/ui";
import type { Role } from "../../types";

function passwordScore(pw: string): number {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}
const SCORE_LABEL = ["Too weak", "Weak", "Fair", "Good", "Strong"];
const SCORE_COLOR = ["bg-rose-500", "bg-rose-400", "bg-amber-400", "bg-lime-500", "bg-emerald-500"];

export default function Register() {
  const [role, setRole] = useState<Role | null>(null);

  return (
    <AuthShell>
      <AnimatePresence mode="wait">
        {role === null ? (
          <motion.div key="choose" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Join SabkaBazzar</h2>
            <p className="mt-2 text-sm text-slate-500">How will you use SabkaBazzar?</p>
            <div className="mt-8 grid gap-4">
              <ChoiceCard icon={ShoppingBag} title="I want to shop" body="Find verified shops near you, check live prices and order for pickup or delivery." onClick={() => setRole("customer")} />
              <ChoiceCard icon={Store} title="I run a shop" body="Sell online from your phone. We'll verify your business before your shop goes live." onClick={() => setRole("shopkeeper")} />
            </div>
            <p className="mt-8 text-center text-sm text-slate-600">
              Already have an account? <Link to="/login" className="font-semibold text-brand-600">Sign in</Link>
            </p>
          </motion.div>
        ) : (
          <AccountForm key="form" role={role} onBack={() => setRole(null)} />
        )}
      </AnimatePresence>
    </AuthShell>
  );
}

function ChoiceCard({ icon: Icon, title, body, onClick }: { icon: typeof Store; title: string; body: string; onClick: () => void }) {
  return (
    <motion.button
      whileHover={{ y: -3, boxShadow: "0 18px 40px -18px rgba(249,115,22,.45)" }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="card flex items-start gap-4 p-5 text-left transition hover:border-brand-300"
    >
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-600"><Icon className="h-6 w-6" /></span>
      <span>
        <span className="block font-bold text-slate-900">{title}</span>
        <span className="mt-1 block text-sm text-slate-500">{body}</span>
      </span>
    </motion.button>
  );
}

function AccountForm({ role, onBack }: { role: Role; onBack: () => void }) {
  const { register } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const score = useMemo(() => passwordScore(password), [password]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = "Enter your full name";
    if (!/^\+?\d{10,15}$/.test(phone.replace(/\s/g, ""))) next.phone = "Enter a valid mobile number";
    if (password.length < 8) next.password = "Use at least 8 characters";
    if (confirm !== password) next.confirm = "Passwords do not match";
    setErrors(next);
    if (Object.keys(next).length) return;

    setLoading(true);
    try {
      const me = await register({ name: name.trim(), phone: phone.replace(/\s/g, ""), password, role });
      if (role === "shopkeeper") {
        toast("Account created. Now complete your business enrollment.");
        navigate("/seller/enroll");
      } else {
        toast(`Welcome to SabkaBazzar, ${me.name.split(" ")[0]}!`);
        navigate("/customer");
      }
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">
        {role === "shopkeeper" ? "Create your seller account" : "Create your account"}
      </h2>
      <p className="mt-2 text-sm text-slate-500">
        {role === "shopkeeper" ? "Next, you'll add your business and legal details for verification." : "It takes less than a minute."}
      </p>

      <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
        <Field label="Full name" error={errors.name}>
          <div className="relative">
            <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className={`${inputClass} pl-10`} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>
        </Field>
        <Field label="Mobile number" error={errors.phone} hint="We use this to sign you in and send order updates.">
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className={`${inputClass} pl-10`} type="tel" placeholder="+91 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
          </div>
        </Field>
        <Field label="Password" error={errors.password}>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className={`${inputClass} pl-10 pr-11`} type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label="Toggle password visibility" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {password && (
            <div className="mt-2">
              <div className="flex gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <motion.div key={i} className="h-1.5 flex-1 rounded-full bg-slate-200"
                    animate={{ backgroundColor: i < score ? undefined : "#e2e8f0" }}>
                    <motion.div className={`h-full rounded-full ${SCORE_COLOR[score]}`} initial={{ width: 0 }} animate={{ width: i < score ? "100%" : "0%" }} />
                  </motion.div>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-500">{SCORE_LABEL[score]}</p>
            </div>
          )}
        </Field>
        <Field label="Confirm password" error={errors.confirm}>
          <input className={inputClass} type={showPassword ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </Field>

        <Button type="submit" loading={loading} className="w-full py-3">
          {role === "shopkeeper" ? "Continue to enrollment" : "Create account"} <ArrowRight className="h-4 w-4" />
        </Button>
        <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500"><Check className="h-3.5 w-3.5 text-emerald-500" /> Your data is used only to run your account.</p>
      </form>
    </motion.div>
  );
}
