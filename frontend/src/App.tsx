import { useState, type FormEvent } from "react";
import { api, errorMessage } from "./api";
import CustomerHome from "./pages/CustomerHome";
import ShopDashboard from "./pages/ShopDashboard";
import type { Role } from "./types";

export default function App() {
  const [role, setRole] = useState<Role | null>(() => localStorage.getItem("role") as Role | null);

  if (!role) return <AuthForm onAuthed={setRole} />;

  const logout = () => {
    localStorage.clear();
    setRole(null);
  };

  return (
    <div>
      <header style={{ display: "flex", justifyContent: "space-between", padding: 16, borderBottom: "1px solid #ddd" }}>
        <strong>LocalShop</strong>
        <button onClick={logout}>Log out</button>
      </header>
      {role === "shopkeeper" && <ShopDashboard />}
      {role === "customer" && <CustomerHome />}
      {role === "admin" && <p style={{ padding: 16 }}>Admin console: build on /admin/overview.</p>}
    </div>
  );
}

function AuthForm({ onAuthed }: { onAuthed: (r: Role) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ name: "", phone: "", password: "", role: "customer" as Role });
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const body = mode === "login" ? { phone: form.phone, password: form.password } : form;
      const res = await api<{ access_token: string; role: Role }>(
        mode === "login" ? "/auth/login" : "/auth/register",
        { method: "POST", body: JSON.stringify(body) },
      );
      localStorage.setItem("token", res.access_token);
      localStorage.setItem("role", res.role);
      onAuthed(res.role);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form onSubmit={submit} style={{ maxWidth: 360, margin: "60px auto", display: "grid", gap: 10 }}>
      <h2>{mode === "login" ? "Log in" : "Create account"}</h2>
      {mode === "register" && (
        <>
          <input placeholder="Full name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            <option value="customer">I am a customer</option>
            <option value="shopkeeper">I run a shop</option>
          </select>
        </>
      )}
      <input placeholder="Phone (+91…)" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      <input type="password" placeholder="Password (8+ chars)" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <button type="submit">{mode === "login" ? "Log in" : "Sign up"}</button>
      <button type="button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
        {mode === "login" ? "New here? Sign up" : "Have an account? Log in"}
      </button>
    </form>
  );
}
