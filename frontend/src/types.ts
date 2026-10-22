export type Role = "customer" | "shopkeeper" | "admin";
export type OrderStatus = "placed" | "confirmed" | "packed" | "ready" | "completed" | "cancelled";
export type Verification = "pending" | "verified" | "rejected";

export interface Me {
  user_id: number;
  name: string;
  phone: string;
  role: Role;
  shop: {
    id: number;
    name: string;
    verification_status: Verification;
    rejection_reason: string | null;
    is_open: boolean;
  } | null;
}

export interface Product {
  id: number;
  name: string;
  category: string;
  unit: string;
  list_price: string;
  price: string;
  discount_percent: number;
  stock: number;
  in_stock: boolean;
  is_active?: boolean;
  rating_avg: number;
  rating_count: number;
}

export interface ShopPublic {
  id: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  delivery_radius_km: number;
  is_open: boolean;
  members_only: boolean;
  verification_status: Verification;
  shop_rating: number;
  shop_rating_count: number;
  delivery_rating: number;
  delivery_rating_count: number;
}

export interface MyShop extends ShopPublic {
  invite_code: string;
}

export interface NearbyShop extends ShopPublic {
  distance_km: number;
  delivers_to_you: boolean;
  is_member: boolean;
}

export interface ShopDetail {
  shop: ShopPublic;
  categories: { name: string; products: Product[] }[];
}

export interface OrderItem {
  id: number;
  product_id: number;
  name: string;
  unit_price: string;
  quantity: number;
}

export interface Order {
  id: number;
  shop_id: number;
  status: OrderStatus;
  fulfilment: "pickup" | "delivery";
  delivery_address: string | null;
  total: string;
  created_at: string;
  reviewed: boolean;
  items: OrderItem[];
}

export interface Dashboard {
  shop: { name: string; is_open: boolean };
  revenue_today: { revenue: string; orders: number };
  revenue_7d: { revenue: string; orders: number };
  revenue_all: { revenue: string; orders: number };
  cancel_rate: number;
  pending_orders: number;
  customers: number;
  shop_rating: { avg: number; count: number };
  delivery_rating: { avg: number; count: number };
}

export interface InventoryResponse {
  low_stock: string[];
  categories: { name: string; products: Product[] }[];
}

export interface CustomerRow {
  customer_id: number;
  name: string;
  phone: string;
  exclusive: boolean;
  completed_orders: number;
  total_spend: string;
}

export interface Enrollment {
  shop_id: number;
  shop_name: string;
  verification_status: Verification;
  rejection_reason: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  legal_name: string;
  owner_full_name: string;
  address: string;
  lat: number;
  lng: number;
  delivery_radius_km: number;
  pan_number: string;
  gst_number: string | null;
  shop_license_number: string;
  fssai_number: string | null;
  bank_account_number: string;
  bank_ifsc: string;
  documents: string[];
}

export interface ApplicationRow {
  shop_id: number;
  shop_name: string;
  legal_name: string;
  owner_name: string;
  owner_phone: string;
  address: string;
  verification_status: Verification;
  submitted_at: string | null;
  rejection_reason: string | null;
}

export interface ApplicationList {
  counts: Record<"pending" | "verified" | "rejected" | "all", number>;
  items: ApplicationRow[];
}

export interface ApplicationDetail extends Enrollment {
  owner_name: string;
  owner_phone: string;
}

export interface AdminOverview {
  users_by_role: Record<string, number>;
  shops: number;
  gross_merchandise_value: string;
  orders_by_status: Record<string, number>;
  daily_revenue_30d: { date: string; revenue: string; orders: number }[];
  top_shops: { id: number; name: string; rating: number; revenue: string }[];
}
