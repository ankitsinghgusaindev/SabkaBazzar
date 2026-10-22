import { motion } from "framer-motion";
import {
  CheckCircle2, ClipboardList, Compass, FileCheck2, LayoutDashboard, LogOut,
  Package, ReceiptText, Store, type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth, homePath } from "../lib/auth";
import type { Me, Role } from "../types";
import { FullScreenLoader } from "./ui";

export function Logo({ to = "/", light = false }: { to?: string; light?: boolean }) {
  return (
    <Link to={to} className="flex items-center gap-2.5">
      <motion.div
        whileHover={{ rotate: -8, scale: 1.06 }}
        className="grid h-9 w-9 place-items-center rounded-xl gradient-brand text-lg font-black text-white shadow-md shadow-brand-500/30"
      >
        S
      </motion.div>
      <span className={`text-lg font-extrabold tracking-tight ${light ? "text-white" : "text-slate-900"}`}>
        Sabka<span className={light ? "text-amber-200" : "text-brand-600"}>Bazzar</span>
      </span>
    </Link>
  );
}

interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean }

const NAV: Record<Role, NavItem[]> = {
  shopkeeper: [
    { to: "/seller", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/seller/orders", label: "Orders", icon: ClipboardList },
    { to: "/seller/inventory", label: "Inventory", icon: Package },
    { to: "/seller/shop", label: "My shop", icon: Store },
  ],
  customer: [
    { to: "/customer", label: "Discover", icon: Compass, end: true },
    { to: "/customer/orders", label: "My orders", icon: ReceiptText },
  ],
  admin: [
    { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
    { to: "/admin/applications", label: "Applications", icon: FileCheck2 },
  ],
};

const PORTAL_LABEL: Record<Role, string> = {
  shopkeeper: "Seller portal",
  customer: "Customer",
  admin: "Admin console",
};

export function Navbar({ portal }: { portal?: string }) {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const initials = me?.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
        <Logo to={me ? homePath(me) : "/"} />
        {portal && (
          <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 md:inline-block">
            {portal}
          </span>
        )}
        {me && (
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold leading-tight">{me.name}</p>
              <p className="text-xs text-slate-500">{me.shop?.name ?? me.phone}</p>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-full gradient-brand text-sm font-bold text-white">{initials}</div>
            <button
              onClick={() => { logout(); navigate("/login"); }}
              className="rounded-xl p-2 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
              aria-label="Log out"
              title="Log out"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

function SideLink({ item }: { item: NavItem }) {
  return (
    <NavLink to={item.to} end={item.end} className="relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-600 transition hover:text-slate-900">
      {({ isActive }) => (
        <>
          {isActive && <motion.span layoutId="side-pill" className="absolute inset-0 -z-10 rounded-xl bg-brand-50" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
          <item.icon className={`h-5 w-5 ${isActive ? "text-brand-600" : ""}`} />
          <span className={isActive ? "text-brand-700" : ""}>{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

export function PortalLayout() {
  const { me } = useAuth();
  const location = useLocation();
  if (!me) return null;
  const items = NAV[me.role];

  return (
    <div className="min-h-screen">
      <Navbar portal={PORTAL_LABEL[me.role]} />
      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <aside className="sticky top-24 hidden h-fit w-60 shrink-0 lg:block">
          <nav className="card space-y-1 p-2">
            {items.map((item) => <SideLink key={item.to} item={item} />)}
          </nav>
        </aside>
        <main className="min-w-0 flex-1 pb-28 lg:pb-8">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
      <nav className="fixed inset-x-3 bottom-3 z-40 flex justify-around rounded-2xl bg-white/90 p-2 shadow-xl ring-1 ring-slate-200 backdrop-blur-xl lg:hidden">
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-semibold transition ${isActive ? "bg-brand-50 text-brand-700" : "text-slate-500"}`}>
            <item.icon className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/** Guards a nested route group. Renders <Outlet/> when allowed. */
export function RequireRole({ role, requireShop = false }: { role: Role; requireShop?: boolean }) {
  const { me, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullScreenLoader />;
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (me.role !== role) return <Navigate to={homePath(me)} replace />;
  if (requireShop && !me.shop) return <Navigate to="/seller/enroll" replace />;
  return <Outlet />;
}

export function HomeRedirect() {
  const { me, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  return <Navigate to={me ? homePath(me) : "/login"} replace />;
}

/** Split-screen shell shared by login and registration. */
export function AuthShell({ children }: { children: ReactNode }) {
  const features = [
    "Verified local shops only",
    "Live prices and stock, refreshed as you browse",
    "Pick up in store or get it delivered",
  ];
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden gradient-brand p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <motion.div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-white/20 blur-3xl"
          animate={{ y: [0, 30, 0], x: [0, 20, 0] }} transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }} />
        <motion.div className="absolute -bottom-28 right-0 h-96 w-96 rounded-full bg-amber-300/30 blur-3xl"
          animate={{ y: [0, -40, 0] }} transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }} />
        <Logo light />
        <div className="relative space-y-8">
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            className="text-4xl font-extrabold leading-tight xl:text-5xl">
            Your neighbourhood,<br />one tap away.
          </motion.h1>
          <ul className="space-y-3">
            {features.map((f, i) => (
              <motion.li key={f} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.1 }}
                className="flex items-center gap-3 text-white/95">
                <CheckCircle2 className="h-5 w-5 shrink-0" /> {f}
              </motion.li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/70">Supporting local shopkeepers since day one.</p>
      </aside>
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden"><Logo /></div>
          {children}
        </div>
      </div>
    </div>
  );
}
