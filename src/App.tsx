import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AuthBootstrap } from "@/components/auth/AuthBootstrap";
import { NotificationConsentBootstrap } from "@/components/auth/NotificationConsentBootstrap";

// Customer Pages
import HomePage from "./pages/customer/HomePage";
import SearchPage from "./pages/customer/SearchPage";
import AllCategoriesPage from "./pages/customer/AllCategoriesPage";
import CartPage from "./pages/customer/CartPage";
import CheckoutPage from "./pages/customer/CheckoutPage";
import OrdersPage from "./pages/customer/OrdersPage";
import ProfilePage from "./pages/customer/ProfilePage";
import CategoryPage from "./pages/customer/CategoryPage";
import AddressesPage from "./pages/customer/AddressesPage";
import ProductDetailsPage from "./pages/customer/ProductDetailsPage";
import CreditHistoryPage from "./pages/customer/CreditHistoryPage";
import CreditApplyPage from "./pages/customer/CreditApplyPage";
import StorePage from "./pages/customer/StorePage";

// Legal Pages
import AboutPage from "./pages/legal/AboutPage";
import TermsPage from "./pages/legal/TermsPage";
import PrivacyPage from "./pages/legal/PrivacyPage";
import RefundPage from "./pages/legal/RefundPage";
import MerchantPolicyPage from "./pages/legal/MerchantPolicyPage";
import AccountDeletionPage from "./pages/legal/AccountDeletionPage";
import { ReConsentGate } from "./components/auth/ReConsentGate";
import { AppErrorBoundary } from "./components/AppErrorBoundary";

// Auth
import AuthPage from "./pages/AuthPage";

// Admin Pages
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminOrders from "./pages/admin/AdminOrders";
import AdminProducts from "./pages/admin/AdminProducts";
import AdminCategories from "./pages/admin/AdminCategories";
import AdminSubcategories from "./pages/admin/AdminSubcategories";
import AdminVendors from "./pages/admin/AdminVendors";
import AdminDelivery from "./pages/admin/AdminDelivery";
import AdminDeliveryFees from "./pages/admin/AdminDeliveryFees";
import AdminTeam from "./pages/admin/AdminTeam";

import AdminSettings from "./pages/admin/AdminSettings";
import AdminServiceAreas from "./pages/admin/AdminServiceAreas";
import AdminBanners from "./pages/admin/AdminBanners";
import AdminTopPicks from "./pages/admin/AdminTopPicks";
import AdminBills from "./pages/admin/AdminBills";
import AdminCashFlow from "./pages/admin/AdminCashFlow";
import AdminCredits from "./pages/admin/AdminCredits";
import AdminReviews from "./pages/admin/AdminReviews";
import AdminBroadcast from "./pages/admin/AdminBroadcast";
import AdminTimeSlots from "./pages/admin/AdminTimeSlots";
import AdminLiveOrders from "./pages/admin/AdminLiveOrders";
import AdminBulkUpload from "./pages/admin/AdminBulkUpload";
import AdminVendorPerformance from "./pages/admin/AdminVendorPerformance";
import AdminPartnerPerformance from "./pages/admin/AdminPartnerPerformance";
import AdminCustomers from "./pages/admin/AdminCustomers";
import AdminAuditLog from "./pages/admin/AdminAuditLog";
import AdminNotificationSettings from "./pages/admin/AdminNotificationSettings";
import AdminDeletionRequests from "./pages/admin/AdminDeletionRequests";

// Vendor Pages
import VendorDashboard from "./pages/vendor/VendorDashboard";
import VendorOrders from "./pages/vendor/VendorOrders";
import VendorProducts from "./pages/vendor/VendorProducts";
import VendorPayments from "./pages/vendor/VendorPayments";
import VendorSettings from "./pages/vendor/VendorSettings";
import VendorSubcategories from "./pages/vendor/VendorSubcategories";

// Delivery Pages
import DeliveryDashboard from "./pages/delivery/DeliveryDashboard";
import DeliveryAvailable from "./pages/delivery/DeliveryAvailable";
import DeliveryActive from "./pages/delivery/DeliveryActive";
import DeliveryHistory from "./pages/delivery/DeliveryHistory";

import DeliverySettings from "./pages/delivery/DeliverySettings";
import DeliveryCashManagement from "./pages/delivery/DeliveryCashManagement";

// Fallback
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

const App = () => (
  <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthBootstrap />
        <NotificationConsentBootstrap />
        <ReConsentGate />
        <Toaster />
        <Sonner />
        <BrowserRouter>
        
        <Routes>
          {/* Customer Routes */}
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/category/all" element={<AllCategoriesPage />} />
          <Route path="/category/:slug" element={<CategoryPage />} />
          <Route path="/product/:slug" element={<ProductDetailsPage />} />
          <Route path="/store/:vendorId" element={<StorePage />} />
          
          {/* Legal Routes */}
          <Route path="/about" element={<AboutPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/refund-policy" element={<RefundPage />} />
          <Route path="/merchant-policy" element={<MerchantPolicyPage />} />
          <Route path="/account-deletion" element={<AccountDeletionPage />} />

          <Route
            path="/checkout"
            element={
              <ProtectedRoute>
                <CheckoutPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders"
            element={
              <ProtectedRoute>
                <OrdersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/credit-history"
            element={
              <ProtectedRoute>
                <CreditHistoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/credit-apply"
            element={
              <ProtectedRoute>
                <CreditApplyPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/addresses"
            element={
              <ProtectedRoute>
                <AddressesPage />
              </ProtectedRoute>
            }
          />
          
          {/* Auth */}
          <Route path="/auth" element={<AuthPage />} />
          
          
          {/* Admin Routes */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/orders"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminOrders />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/products"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminProducts />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/categories"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminCategories />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/subcategories"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminSubcategories />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/vendors"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminVendors />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/delivery"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminDelivery />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/delivery-fees"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminDeliveryFees />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/team"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminTeam />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminSettings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/service-areas"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminServiceAreas />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/banners"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminBanners />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/top-picks"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminTopPicks />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/bills"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminBills />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/cash-flow"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminCashFlow />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/credits"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminCredits />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/reviews"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminReviews />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/broadcast"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminBroadcast />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/time-slots"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminTimeSlots />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/live-orders"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminLiveOrders />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/bulk-upload"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminBulkUpload />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/vendor-performance"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminVendorPerformance />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/partner-performance"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminPartnerPerformance />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/customers"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminCustomers />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/audit-log"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminAuditLog />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/notification-settings"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminNotificationSettings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/deletion-requests"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminDeletionRequests />
              </ProtectedRoute>
            }
          />


          <Route
            path="/vendor"
            element={
              <ProtectedRoute allowedRoles={['vendor']}>
                <VendorDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/vendor/orders"
            element={
              <ProtectedRoute allowedRoles={['vendor']}>
                <VendorOrders />
              </ProtectedRoute>
            }
          />
          <Route
            path="/vendor/products"
            element={
              <ProtectedRoute allowedRoles={['vendor']}>
                <VendorProducts />
              </ProtectedRoute>
            }
          />
          <Route
            path="/vendor/subcategories"
            element={
              <ProtectedRoute allowedRoles={['vendor']}>
                <VendorSubcategories />
              </ProtectedRoute>
            }
          />
          <Route
            path="/vendor/payments"
            element={
              <ProtectedRoute allowedRoles={['vendor']}>
                <VendorPayments />
              </ProtectedRoute>
            }
          />
          <Route
            path="/vendor/settings"
            element={
              <ProtectedRoute allowedRoles={['vendor']}>
                <VendorSettings />
              </ProtectedRoute>
            }
          />
          
          {/* Delivery Routes */}
          <Route
            path="/delivery"
            element={
              <ProtectedRoute allowedRoles={['delivery_partner']}>
                <DeliveryDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/delivery/available"
            element={
              <ProtectedRoute allowedRoles={['delivery_partner']}>
                <DeliveryAvailable />
              </ProtectedRoute>
            }
          />
          <Route
            path="/delivery/active"
            element={
              <ProtectedRoute allowedRoles={['delivery_partner']}>
                <DeliveryActive />
              </ProtectedRoute>
            }
          />
          <Route
            path="/delivery/history"
            element={
              <ProtectedRoute allowedRoles={['delivery_partner']}>
                <DeliveryHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/delivery/cash"
            element={
              <ProtectedRoute allowedRoles={['delivery_partner']}>
                <DeliveryCashManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/delivery/settings"
            element={
              <ProtectedRoute allowedRoles={['delivery_partner']}>
                <DeliverySettings />
              </ProtectedRoute>
            }
          />
          
          {/* Catch-all */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;
