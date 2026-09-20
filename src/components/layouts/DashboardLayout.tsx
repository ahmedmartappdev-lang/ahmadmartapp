import React, { useLayoutEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  X, ChevronDown, LogOut, User, Bell, BellRing, Megaphone,
  LayoutDashboard, Package, Users, ShoppingCart,
  Truck, Settings, Store, ClipboardList,
  FolderTree, Shield, MapPin, Image, Receipt, Wallet, IndianRupee, Star,
  Activity, BarChart3, UserSearch, History, Upload, AlertTriangle, UserMinus
} from 'lucide-react';
import { DiagPanel } from '@/components/admin/DiagPanel';
import { NotificationsBell } from '@/components/shared/NotificationsBell';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

export interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

type NavInput = NavItem[] | NavSection[];

function isSectioned(nav: NavInput): nav is NavSection[] {
  return Array.isArray(nav) && nav.length > 0 && (nav[0] as any).items !== undefined;
}

function flatten(nav: NavInput): NavItem[] {
  return isSectioned(nav) ? nav.flatMap(s => s.items) : nav;
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  title: string;
  navItems: NavInput;
  roleColor: string;
  roleName: string;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  title,
  navItems,
  roleColor,
  roleName,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
  };

  const flatItems = flatten(navItems);

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <DiagPanel />
      {/* Mobile Header */}
      <header className="lg:hidden sticky top-0 z-50 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src="/logo-mark.png" alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
            <h1 className="font-semibold text-[15px] tracking-tight text-gray-900 truncate">{title}</h1>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Avatar className="w-7 h-7">
                  <AvatarFallback className="bg-gray-100 text-gray-700 text-xs font-medium">
                    {user?.email?.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => navigate('/profile')}>
                <User className="w-4 h-4 mr-2" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:block fixed left-0 top-0 bottom-0 w-[244px] bg-white border-r border-gray-100 z-40">
        <SidebarContent
          nav={navItems}
          location={location}
          roleName={roleName}
        />
      </aside>

      {/* Main */}
      <main className="lg:ml-[244px] min-h-screen pb-20 lg:pb-0">
        {/* Desktop Header */}
        <header className="hidden lg:flex sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-100 items-center justify-between px-8 py-4">
          <h1 className="text-[18px] font-semibold tracking-tight text-gray-900">{title}</h1>
          <div className="flex items-center gap-2">
            <NotificationsBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 h-9 px-2 hover:bg-gray-50">
                  <Avatar className="w-7 h-7">
                    <AvatarFallback className="bg-gray-100 text-gray-700 text-xs font-medium">
                      {user?.email?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium text-gray-700 max-w-[180px] truncate">{user?.email}</span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => navigate('/profile')}>
                  <User className="w-4 h-4 mr-2" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <div className="p-4 lg:p-8 max-w-[1400px] mx-auto">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <MobileBottomNav navItems={flatItems} currentPath={location.pathname} />
    </div>
  );
};

const SidebarContent: React.FC<{
  nav: NavInput;
  location: { pathname: string };
  roleName: string;
}> = ({ nav, location, roleName }) => {
  const sections: NavSection[] = isSectioned(nav) ? nav : [{ items: nav }];
  const navRef = useRef<HTMLElement>(null);
  const storageKey = `sidebar-scroll-${roleName}`;

  // Sidebar remounts on every route change (each page renders its own
  // DashboardLayout). Persist scroll position so the admin's place isn't
  // lost every time they click a nav item.
  useLayoutEffect(() => {
    const saved = sessionStorage.getItem(storageKey);
    if (navRef.current && saved) {
      navRef.current.scrollTop = parseInt(saved, 10) || 0;
    }
  }, [storageKey]);

  const handleScroll = () => {
    if (navRef.current) {
      sessionStorage.setItem(storageKey, String(navRef.current.scrollTop));
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-4 border-b border-gray-100 flex items-center gap-3">
        <img src="/logo-mark.png" alt="Ahmad Mart" className="w-9 h-9 rounded-full object-cover" />
        <div className="min-w-0">
          <h2 className="font-semibold text-gray-900 tracking-tight">Ahmad Mart</h2>
          <p className="text-[11px] text-gray-500">{roleName}</p>
        </div>
      </div>

      <nav ref={navRef} onScroll={handleScroll} className="flex-1 px-3 py-4 overflow-y-auto">
        {sections.map((section, sIdx) => (
          <div key={sIdx} className={cn(sIdx > 0 && 'mt-5')}>
            {section.title && (
              <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {section.title}
              </div>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors",
                      isActive
                        ? "bg-gray-100 text-gray-900 font-semibold"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 font-medium"
                    )}
                  >
                    <item.icon className={cn("w-4 h-4 shrink-0", isActive ? "text-gray-900" : "text-gray-400")} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-gray-100">
        <Link
          to="/"
          className="flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <Store className="w-4 h-4" />
          Go to Store
        </Link>
      </div>
    </div>
  );
};

/** Mobile bottom nav — shows the whole list when it fits (six tabs covers the
    vendor and delivery roles, whose Payments/Cash Management tabs must not be
    dropped); only very long lists (admin) fall back to first-4 + last. */
const MobileBottomNav: React.FC<{ navItems: NavItem[]; currentPath: string }> = ({ navItems, currentPath }) => {
  const priorityItems = navItems.length <= 6
    ? navItems
    : [...navItems.slice(0, 4), navItems[navItems.length - 1]];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-50">
      <div className="flex items-center justify-around max-w-lg mx-auto py-1.5">
        {priorityItems.map((item) => {
          const isActive = currentPath === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex flex-col items-center text-center gap-0.5 px-1 py-1.5 rounded-lg transition-colors min-w-[50px]",
                isActive ? "text-gray-900" : "text-gray-400"
              )}
            >
              <Icon className={cn("w-5 h-5", isActive && "text-gray-900")} />
              <span className="text-[10px] font-medium leading-none">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

// Admin nav grouped into sections — sections render with subtle headers
export const adminNavItems: NavSection[] = [
  {
    items: [
      { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
      { label: 'Live Orders', href: '/admin/live-orders', icon: Activity },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Orders', href: '/admin/orders', icon: ShoppingCart },
      { label: 'Customers', href: '/admin/customers', icon: UserSearch },
    ],
  },
  {
    title: 'Catalog',
    items: [
      { label: 'Products', href: '/admin/products', icon: Package },
      { label: 'Bulk Upload', href: '/admin/bulk-upload', icon: Upload },
      { label: 'Categories', href: '/admin/categories', icon: FolderTree },
      { label: 'Subcategories', href: '/admin/subcategories', icon: FolderTree },
      { label: 'Time Slots', href: '/admin/time-slots', icon: ClipboardList },
    ],
  },
  {
    title: 'Vendors',
    items: [
      { label: 'Vendors', href: '/admin/vendors', icon: Store },
      { label: 'Performance', href: '/admin/vendor-performance', icon: BarChart3 },
    ],
  },
  {
    title: 'Delivery',
    items: [
      { label: 'Partners', href: '/admin/delivery', icon: Truck },
      { label: 'Performance', href: '/admin/partner-performance', icon: BarChart3 },
      { label: 'Delivery Fees', href: '/admin/delivery-fees', icon: IndianRupee },
      { label: 'Service Areas', href: '/admin/service-areas', icon: MapPin },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Bills', href: '/admin/bills', icon: Receipt },
      { label: 'Cash Flow', href: '/admin/cash-flow', icon: Wallet },
      { label: 'Credits', href: '/admin/credits', icon: IndianRupee },
    ],
  },
  {
    title: 'Marketing',
    items: [
      { label: 'Banners', href: '/admin/banners', icon: Image },
      { label: 'Top Picks', href: '/admin/top-picks', icon: Star },
      { label: 'Reviews', href: '/admin/reviews', icon: Star },
      { label: 'Broadcast Push', href: '/admin/broadcast', icon: Megaphone },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Admin Team', href: '/admin/team', icon: Shield },
      { label: 'Audit Log', href: '/admin/audit-log', icon: History },
      { label: 'Notifications', href: '/admin/notification-settings', icon: BellRing },
      { label: 'Deletion Requests', href: '/admin/deletion-requests', icon: UserMinus },
      { label: 'Settings', href: '/admin/settings', icon: Settings },
    ],
  },
];

export const vendorNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/vendor', icon: LayoutDashboard },
  { label: 'Orders', href: '/vendor/orders', icon: ClipboardList },
  { label: 'Products', href: '/vendor/products', icon: Package },
  { label: 'Subcategories', href: '/vendor/subcategories', icon: FolderTree },
  { label: 'Payments', href: '/vendor/payments', icon: Wallet },
  { label: 'Settings', href: '/vendor/settings', icon: Settings },
];

export const deliveryNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/delivery', icon: LayoutDashboard },
  { label: 'Available Orders', href: '/delivery/available', icon: Package },
  { label: 'Active Orders', href: '/delivery/active', icon: Truck },
  { label: 'Order History', href: '/delivery/history', icon: ClipboardList },
  { label: 'Cash Management', href: '/delivery/cash', icon: Wallet },
  { label: 'Settings', href: '/delivery/settings', icon: Settings },
];
