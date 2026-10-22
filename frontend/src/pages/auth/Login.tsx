import { motion } from "framer-motion";
import { ArrowRight, Eye, EyeOff, Lock, Phone, ShieldCheck, ShoppingBag, Store } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthShell } from "../../components/Layout";
import { Button, Field, inputClass } from "../../components/ui";
import { errorMessage } from "../../lib/api";
import { homePath, useAuth } from "../../lib/auth";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const me = await login(phone.trim(), password);
      navigate(from ?? homePath(me), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setShake((s) => s + 1);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Welcome back</h2>
        <p className="mt-2 text-sm text-slate-500">Sign in and we'll take you to the right portal automatically.</p>

        <div className="mt-6 flex gap-2 text-xs font-semibold text-slate-500">
          {[{ icon: ShoppingBag, label: "Customer" }, { icon: Store, label: "Seller" }, { icon: ShieldCheck, label: "Admin" }].map(({ icon: Icon, label }) => (
            <span key={label} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 ring-1 ring-slate-200">
              <Icon className="h-3.5 w-3.5 text-brand-600" /> {label}
            </span>
          ))}
        </div>

        <motion.form
          key={shake}
          onSubmit={submit}
          className="mt-8 space-y-5"
          animate={shake ? { x: [0, -10, 10, -6, 6, 0] } : undefined}
          transition={{ duration: 0.4 }}
        >
          <Field label="Mobile number">
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className={`${inputClass} pl-10`} type="tel" inputMode="tel" placeholder="+91 98765 43210"
                autoComplete="username" required value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </Field>

          <Field label="Password">
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className={`${inputClass} pl-10 pr-11`} type={showPassword ? "text" : "password"} placeholder="Your password"
                autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-slate-700">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>

          {error && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
              className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-rose-200">
              {error}
            </motion.div>
          )}

          <Button type="submit" loading={loading} className="w-full py-3">
            Sign in <ArrowRight className="h-4 w-4" />
          </Button>
        </motion.form>

        <p className="mt-8 text-center text-sm text-slate-600">
          New to SabkaBazzar?{" "}
          <Link to="/register" className="font-semibold text-brand-600 hover:text-brand-700">Create an account</Link>
        </p>
      </motion.div>
    </AuthShell>
  );
}
