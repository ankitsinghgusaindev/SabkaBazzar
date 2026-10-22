import { Link, Route, Routes } from "react-router-dom";
import { HomeRedirect, PortalLayout, RequireRole } from "./components/Layout";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import Enrollment from "./pages/seller/Enrollment";
import SellerDashboard from "./pages/seller/Dashboard";
import SellerOrders from "./pages/seller/Orders";
import Inventory from "./pages/seller/Inventory";
import ShopSettings from "./pages/seller/Shop";
import CustomerHome from "./pages/customer/Home";
import ShopPage from "./pages/customer/ShopPage";
import CustomerOrders from "./pages/customer/Orders";
import AdminOverview from "./pages/admin/Overview";
import Applications from "./pages/admin/Applications";
import ReviewApplication from "./pages/admin/Review";

function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center p-6 text-center">
      <div>
        <p className="text-6xl font-black gradient-text">404</p>
        <p className="mt-2 text-slate-600">This page doesn't exist.</p>
        <Link to="/" className="mt-6 inline-block font-semibold text-brand-600">Go home</Link>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Seller onboarding works before a shop exists, so it skips requireShop */}
      <Route element={<RequireRole role="shopkeeper" />}>
        <Route path="/seller/enroll" element={<Enrollment />} />
      </Route>

      <Route element={<RequireRole role="shopkeeper" requireShop />}>
        <Route element={<PortalLayout />}>
          <Route path="/seller" element={<SellerDashboard />} />
          <Route path="/seller/orders" element={<SellerOrders />} />
          <Route path="/seller/inventory" element={<Inventory />} />
          <Route path="/seller/shop" element={<ShopSettings />} />
        </Route>
      </Route>

      <Route element={<RequireRole role="customer" />}>
        <Route element={<PortalLayout />}>
          <Route path="/customer" element={<CustomerHome />} />
          <Route path="/customer/shop/:id" element={<ShopPage />} />
          <Route path="/customer/orders" element={<CustomerOrders />} />
        </Route>
      </Route>

      <Route element={<RequireRole role="admin" />}>
        <Route element={<PortalLayout />}>
          <Route path="/admin" element={<AdminOverview />} />
          <Route path="/admin/applications" element={<Applications />} />
          <Route path="/admin/applications/:shopId" element={<ReviewApplication />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
