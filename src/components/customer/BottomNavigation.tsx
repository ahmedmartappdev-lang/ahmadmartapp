import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCartStore } from '@/stores/cartStore';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const HomeFilled = () => (
  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a2 2 0 002 2h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a2 2 0 002-2v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"></path>
  </svg>
);

const SearchOutline = () => (
  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1"></rect>
    <rect x="14" y="3" width="7" height="7" rx="1"></rect>
    <rect x="14" y="14" width="7" height="7" rx="1"></rect>
    <rect x="3" y="14" width="7" height="7" rx="1"></rect>
  </svg>
);

const CartOutline = () => (
  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
  </svg>
);

const OrdersOutline = () => (
  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
  </svg>
);

const ProfileOutline = () => (
  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
    <circle cx="12" cy="7" r="4"></circle>
  </svg>
);

export const BottomNavigation: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const totalItems = useCartStore((state) => state.getTotalItems());
  
  const { user } = useAuthStore();

  if (location.pathname === '/auth') {
    return null;
  }

  // Intercept clicks on protected routes if the user is not logged in
  const handleProtectedNavigation = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!user) {
      e.preventDefault();
      navigate('/auth');
    }
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white shadow-[0_-4px_12px_rgba(0,0,0,0.05)] px-6 py-3 flex items-center justify-between z-[60] pb-safe md:hidden">
      <Link to="/" className={cn("flex flex-col items-center gap-1", location.pathname === '/' ? "text-primary" : "text-muted-foreground")}>
        <HomeFilled />
        <span className="text-[10px] font-bold">Home</span>
      </Link>
      <Link to="/category/all" className={cn("flex flex-col items-center gap-1", location.pathname.includes('/category') ? "text-primary" : "text-muted-foreground")}>
        <SearchOutline />
        <span className="text-[10px] font-bold">Categories</span>
      </Link>
      <Link to="/cart" className={cn("flex flex-col items-center gap-1 relative", location.pathname === '/cart' ? "text-primary" : "text-muted-foreground")}>
        {totalItems > 0 && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-white text-[10px] flex items-center justify-center rounded-full border-2 border-white font-bold">
            {totalItems}
          </div>
        )}
        <CartOutline />
        <span className="text-[10px] font-bold">Cart</span>
      </Link>
      
      {/* Protected Link: Orders */}
      <Link 
        to={user ? "/orders" : "#"} 
        onClick={handleProtectedNavigation}
        className={cn("flex flex-col items-center gap-1", location.pathname === '/orders' ? "text-primary" : "text-muted-foreground")}
      >
        <OrdersOutline />
        <span className="text-[10px] font-bold">Orders</span>
      </Link>

      {/* Protected Link: Profile */}
      <Link 
        to={user ? "/profile" : "#"} 
        onClick={handleProtectedNavigation}
        className={cn("flex flex-col items-center gap-1", location.pathname === '/profile' ? "text-primary" : "text-muted-foreground")}
      >
        <Avatar className="w-6 h-6 border border-gray-200/60 bg-white">
          <AvatarFallback className="bg-white text-current">
            <ProfileOutline />
          </AvatarFallback>
        </Avatar>
        <span className="text-[10px] font-bold">Profile</span>
      </Link>
    </nav>
  );
};

export default BottomNavigation;
