import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { 
  Search, 
  ShoppingCart, 
  Menu, 
  MapPin, 
  User, 
  LogOut, 
  Package, 
  LayoutDashboard,
  ChevronDown,
  Info,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { NotificationsBell } from '@/components/shared/NotificationsBell';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from '@/components/ui/badge';
import { useCartStore } from '@/stores/cartStore';
import { useAuth } from '@/hooks/useAuth';
import { useUserRoles } from '@/hooks/useUserRoles';
import { useAuthStore } from '@/stores/authStore';
import { useProductSuggestions } from '@/hooks/useProducts';
import { useUserLocation } from '@/hooks/useUserLocation';
import { LocationPickerDialog } from '@/components/customer/LocationPickerDialog';

export const Header: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();
  const { signOut } = useAuth();
  const { items } = useCartStore();
  const { isAdmin, isVendor, isDeliveryPartner } = useUserRoles();
  const { location: userLocation, isLoading: locationLoading, isServiceable, updateLocation } = useUserLocation();
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const { data: suggestions, isLoading: isSearching } = useProductSuggestions(debouncedQuery);
  const cartItemCount = items.reduce((acc, item) => acc + item.quantity, 0);

  useEffect(() => {
    setSearchQuery(searchParams.get('q') || '');
  }, [searchParams]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [searchRef]);

  const handleSearchSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setShowSuggestions(false);

    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) return;

    navigate(`/?q=${encodeURIComponent(trimmedQuery)}`);
  };

  const handleProductClick = (slug: string) => {
    setSearchQuery(''); 
    setShowSuggestions(false);
    navigate(`/product/${slug}`);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <header className="w-full bg-white/80 backdrop-blur-md border-b border-gray-100 shadow-sm z-50">
      <div className="container mx-auto px-4 md:px-6">
        <div className="hidden md:flex items-center justify-between h-16 md:h-20 gap-4">
          
          {/* 1. Logo & Desktop Menu */}
          <div className="flex items-center gap-4 md:gap-8">
            <Link to="/" className="flex items-center gap-2 group shrink-0">
              <img src="/logo-mark.png" alt="Ahmad Mart" className="h-12 w-12 md:h-14 md:w-14 shrink-0 rounded-full object-cover group-hover:scale-105 transition-transform shadow-sm" />
            </Link>

            <div className="hidden md:flex items-center">
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                     <button 
                       onClick={() => setLocationDialogOpen(true)}
                       className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200 hover:border-[#ff3f6c]/30 hover:bg-[#ff3f6c]/5 transition-all duration-300 group">
                      <div className="p-1 bg-white rounded-full shadow-sm group-hover:shadow-md transition-shadow">
                        <MapPin className="w-4 h-4 text-[#ff3f6c]" fill="currentColor" fillOpacity={0.1} />
                      </div>
                      <div className="flex flex-col items-start text-xs">
                        <span className="text-gray-400 font-medium leading-none mb-0.5 text-[10px] uppercase tracking-wider">Delivering to</span>
                        <span className="font-bold text-gray-800 group-hover:text-[#ff3f6c] transition-colors max-w-[200px] truncate block">
                          {locationLoading ? 'Detecting...' : userLocation?.fullAddress || 'Select Location'}
                        </span>
                      </div>
                      <ChevronDown className="w-3 h-3 text-gray-400 group-hover:text-[#ff3f6c] transition-colors ml-1" />
                    </button>
                  </TooltipTrigger>
                  {!isServiceable && userLocation && (
                    <TooltipContent 
                      side="bottom" 
                      className="max-w-[280px] p-4 bg-white/95 backdrop-blur-xl border border-[#ff3f6c]/20 shadow-xl text-center z-50"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-[#ff3f6c]/10 flex items-center justify-center mb-1">
                          <Info className="w-4 h-4 text-[#ff3f6c]" />
                        </div>
                        <p className="font-semibold text-gray-900 text-sm">Currently not delivering here</p>
                        <p className="text-xs text-gray-500 leading-relaxed">
                          We are actively expanding our network. <br/>
                          <span className="text-[#ff3f6c] font-medium">Ahmad Mart</span> will reach your city soon!
                        </p>
                      </div>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {/* 3. Search Bar with Live Suggestions */}
          <div className="hidden md:flex flex-1 max-w-xl mx-8 relative" ref={searchRef}>
            <form onSubmit={handleSearchSubmit} className="w-full relative group">
              <input
                type="text"
                placeholder="Search products..."
                className="w-full pl-12 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-[#ff3f6c] focus:ring-4 focus:ring-[#ff3f6c]/10 transition-all outline-none text-sm placeholder:text-gray-400"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
              />
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-[#ff3f6c] transition-colors" />
            </form>

            {/* Live Search Dropdown */}
            {showSuggestions && searchQuery.length >= 1 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-50 overflow-hidden animate-in fade-in-0 zoom-in-95">
                {isSearching ? (
                  <div className="flex items-center justify-center py-4 text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    <span className="text-xs">Searching...</span>
                  </div>
                ) : suggestions && suggestions.length > 0 ? (
                  <>
                    <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Products</div>
                    {suggestions.map((product) => (
                      <div 
                        key={product.id}
                        className="px-4 py-2 hover:bg-white cursor-pointer flex items-center gap-3 border-b border-gray-50 last:border-0"
                        onClick={() => handleProductClick(product.slug)}
                      >
                        <div className="w-8 h-8 rounded-md bg-gray-100 flex-shrink-0 overflow-hidden border border-gray-200">
                           <img src={product.primary_image_url || '/placeholder.svg'} alt={product.name} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium text-gray-900 truncate">{product.name}</h4>
                          <p className="text-[10px] text-gray-500 truncate">{product.category?.name}</p>
                        </div>
                        <div className="font-bold text-xs text-[#0c831f]">
                          ₹{product.admin_selling_price ?? product.selling_price}
                        </div>
                      </div>
                    ))}
                    <div 
                      className="border-t border-gray-100 p-2 bg-gray-50 cursor-pointer hover:bg-white text-center text-xs font-medium text-[#0c831f]"
                      onClick={() => handleSearchSubmit()}
                    >
                      View all results for "{searchQuery}"
                    </div>
                  </>
                ) : (
                  <div className="py-4 text-center text-gray-400 text-xs">
                    No products found for "{searchQuery}"
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 4. Right Actions */}
          <div className="flex items-center gap-3 md:gap-6">
            {user ? (
              <>
              <NotificationsBell iconSize={22} className="rounded-full hover:bg-white w-10 h-10 border border-transparent hover:border-gray-200 text-gray-700" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full hover:bg-white w-10 h-10 border border-transparent hover:border-gray-200">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src="/image_36e101.png" alt="Profile" className="object-cover" />
                      <AvatarFallback><User className="h-4 w-4 text-gray-700" /></AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 mt-2">
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{user.email?.split('@')[0]}</p>
                      <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/profile')} className="cursor-pointer">
                    <User className="mr-2 h-4 w-4" /> Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/orders')} className="cursor-pointer">
                    <Package className="mr-2 h-4 w-4" /> Orders
                  </DropdownMenuItem>
                  
                  {isAdmin && (
                    <DropdownMenuItem onClick={() => navigate('/admin')} className="cursor-pointer text-purple-600 focus:text-purple-600 focus:bg-purple-50">
                      <LayoutDashboard className="mr-2 h-4 w-4" /> Admin Dashboard
                    </DropdownMenuItem>
                  )}
                  {isVendor && (
                    <DropdownMenuItem onClick={() => navigate('/vendor')} className="cursor-pointer text-blue-600 focus:text-blue-600 focus:bg-blue-50">
                      <LayoutDashboard className="mr-2 h-4 w-4" /> Vendor Dashboard
                    </DropdownMenuItem>
                  )}
                  {isDeliveryPartner && (
                    <DropdownMenuItem onClick={() => navigate('/delivery')} className="cursor-pointer text-orange-600 focus:text-orange-600 focus:bg-orange-50">
                      <LayoutDashboard className="mr-2 h-4 w-4" /> Delivery Dashboard
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50">
                    <LogOut className="mr-2 h-4 w-4" /> Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              </>
            ) : (
              <Button
                onClick={() => navigate('/auth')}
                variant="ghost"
                className="font-semibold text-gray-700 hover:text-foreground hover:bg-muted"
              >
                Login
              </Button>
            )}

            <Link to="/cart">
              <Button variant="default" size="icon" className="relative rounded-full bg-[#1a1a1a] hover:bg-black w-10 h-10 shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5">
                <ShoppingCart className="h-5 w-5 text-white" />
                {cartItemCount > 0 && (
                  <Badge 
                    className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 bg-[#ff3f6c] text-white border-2 border-white rounded-full text-[10px] font-bold shadow-sm"
                  >
                    {cartItemCount}
                  </Badge>
                )}
              </Button>
            </Link>
          </div>
        </div>

        {/* Mobile Header Design */}
        <div className="md:hidden">
          <header className="sticky top-0 z-50 bg-white px-4 py-3 shadow-[0_2px_10px_rgba(0,0,0,0.04)] flex items-center justify-between mx-[-16px]">
            <div className="flex items-center gap-2 min-w-0">
              {/* shrink-0 everywhere before the text: a long saved address
                  otherwise squeezes the logo into an oval before truncating. */}
              <Link to="/" className="shrink-0">
                <img src="/logo-mark.png" alt="Ahmad Mart" className="h-11 w-11 shrink-0 rounded-full object-cover shadow-sm" />
              </Link>
              <button onClick={() => setLocationDialogOpen(true)} className="p-2 bg-surface rounded-full shrink-0">
                <MapPin className="h-5 w-5 text-primary" />
              </button>
              <div onClick={() => setLocationDialogOpen(true)} className="cursor-pointer min-w-0">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {locationLoading ? 'Detecting...' : userLocation?.city ? `Delivering in ${userLocation.city}` : 'Set your location'}
                </p>
                <h2 className="text-sm font-bold text-textMain truncate max-w-[150px]">
                   {locationLoading ? '...' : userLocation?.fullAddress || 'Select Location'}
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <NotificationsBell iconSize={22} className="text-dark hover:bg-gray-100" />
              <Link to="/cart" className="relative p-2 text-dark">
                <ShoppingCart className="h-6 w-6" />
                {cartItemCount > 0 && (
                  <span className="absolute top-1 right-1 w-3 h-3 flex items-center justify-center bg-red-500 rounded-full border-2 border-white text-[8px] text-white font-bold">
                    {cartItemCount}
                  </span>
                )}
              </Link>
              <div
                className="w-9 h-9 rounded-full bg-gray-200 overflow-hidden border border-gray-100 cursor-pointer"
                onClick={() => user ? navigate('/profile') : navigate('/auth')}
              >
                <Avatar className="w-full h-full">
                  <AvatarImage src="/image_36e101.png" alt="Avatar" className="object-cover" />
                  <AvatarFallback><User className="h-5 w-5 text-gray-500" /></AvatarFallback>
                </Avatar>
              </div>
            </div>
          </header>

          {location.pathname === '/' && (
            <section className="px-4 py-4 bg-white mx-[-16px]">
              <form onSubmit={handleSearchSubmit} className="relative flex items-center">
                <div className="absolute left-4 text-muted-foreground">
                  <Search className="h-5 w-5" />
                </div>
                <input 
                  className="w-full pl-12 pr-12 py-3 bg-surface border-none rounded-full text-sm focus:ring-2 focus:ring-primary/20 placeholder-muted font-medium outline-none" 
                  placeholder="Search groceries, essentials..." 
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </form>
            </section>
          )}
        </div>
      </div>
      
      <LocationPickerDialog
        open={locationDialogOpen}
        onOpenChange={setLocationDialogOpen}
        onLocationConfirm={updateLocation}
        currentLat={userLocation?.lat}
        currentLng={userLocation?.lng}
      />
    </header>
  );
};
