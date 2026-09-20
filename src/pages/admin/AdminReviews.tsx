import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Star, Search, ChevronDown, ChevronUp, Package, Truck, User, Calendar, MapPin, Clock, Store } from 'lucide-react';
import { DashboardLayout, adminNavItems } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface Review {
  id: string;
  order_id: string;
  customer_id: string;
  review_type: 'product' | 'delivery' | 'overall' | 'vendor';
  product_id: string | null;
  delivery_partner_id: string | null;
  vendor_id: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
}

const AdminReviews: React.FC = () => {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterRating, setFilterRating] = useState<string>('all');
  const [expandedReview, setExpandedReview] = useState<string | null>(null);

  // Fetch all reviews
  const { data: reviews, isLoading } = useQuery({
    queryKey: ['admin-reviews'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Review[];
    },
  });

  // Fetch orders with full details for expanded view
  const { data: orders } = useQuery({
    queryKey: ['admin-review-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          order_items(*)
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch customer profiles
  const { data: profiles } = useQuery({
    queryKey: ['admin-review-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, phone');
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch delivery partners
  const { data: deliveryPartners } = useQuery({
    queryKey: ['admin-review-delivery-partners'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('delivery_partners')
        .select('id, full_name, phone, rating');
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch products
  const { data: products } = useQuery({
    queryKey: ['admin-review-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, primary_image_url');
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch vendors
  const { data: vendors } = useQuery({
    queryKey: ['admin-review-vendors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendors')
        .select('id, business_name');
      if (error) throw error;
      return data || [];
    },
  });

  const getCustomer = (customerId: string) =>
    profiles?.find(p => p.user_id === customerId);

  const getOrder = (orderId: string) =>
    orders?.find(o => o.id === orderId);

  const getDeliveryPartner = (partnerId: string | null) =>
    partnerId ? deliveryPartners?.find(d => d.id === partnerId) : null;

  const getProduct = (productId: string | null) =>
    productId ? products?.find(p => p.id === productId) : null;

  const getVendor = (vendorId: string) =>
    vendors?.find(v => v.id === vendorId);

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'text-amber-700',
      confirmed: 'text-blue-700',
      preparing: 'text-orange-700',
      delivered: 'text-emerald-700',
      cancelled: 'text-red-700',
    };
    return colors[status] || 'text-slate-600';
  };

  const getRatingColor = (rating: number) => {
    if (rating >= 4) return 'text-green-600';
    if (rating >= 3) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getTypeIcon = (type: string) => {
    if (type === 'product') return <Package className="w-4 h-4" />;
    if (type === 'delivery') return <Truck className="w-4 h-4" />;
    if (type === 'vendor') return <Store className="w-4 h-4" />;
    return <Star className="w-4 h-4" />;
  };

  const getTypeBadge = (type: string) => {
    const styles: Record<string, string> = {
      product: 'text-violet-700',
      delivery: 'text-blue-700',
      overall: 'text-emerald-700',
      vendor: 'text-amber-700',
    };
    return styles[type] || 'text-slate-600';
  };

  // Filter reviews
  const filteredReviews = reviews?.filter(review => {
    const customer = getCustomer(review.customer_id);
    const order = getOrder(review.order_id);
    const product = getProduct(review.product_id);
    const partner = getDeliveryPartner(review.delivery_partner_id);

    const matchesSearch = search === '' || [
      customer?.full_name,
      customer?.phone,
      order?.order_number,
      product?.name,
      partner?.full_name,
      review.comment,
    ].some(field => field?.toLowerCase().includes(search.toLowerCase()));

    const matchesType = filterType === 'all' || review.review_type === filterType;
    const matchesRating = filterRating === 'all' || review.rating === Number(filterRating);

    return matchesSearch && matchesType && matchesRating;
  });

  // Stats
  const totalReviews = reviews?.length || 0;
  const avgRating = totalReviews > 0
    ? (reviews!.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(1)
    : '0.0';
  const productReviews = reviews?.filter(r => r.review_type === 'product').length || 0;
  const deliveryReviews = reviews?.filter(r => r.review_type === 'delivery').length || 0;
  const vendorReviews = reviews?.filter(r => r.review_type === 'vendor').length || 0;
  const overallReviews = reviews?.filter(r => r.review_type === 'overall').length || 0;
  const lowRatings = reviews?.filter(r => r.rating <= 2).length || 0;

  const renderStars = (rating: number) => (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(star => (
        <Star
          key={star}
          className={`w-4 h-4 ${star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
        />
      ))}
    </div>
  );

  return (
    <DashboardLayout
      title="Reviews & Ratings"
      navItems={adminNavItems}
      roleColor="bg-red-500 text-white"
      roleName="Admin Panel"
    >
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{totalReviews}</p>
            <p className="text-xs text-muted-foreground">Total Reviews</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold flex items-center justify-center gap-1">
              {avgRating} <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
            </p>
            <p className="text-xs text-muted-foreground">Avg Rating</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{vendorReviews}</p>
            <p className="text-xs text-muted-foreground">Store Reviews</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{deliveryReviews}</p>
            <p className="text-xs text-muted-foreground">Delivery Reviews</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-purple-600">{productReviews}</p>
            <p className="text-xs text-muted-foreground">Product Reviews</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{overallReviews}</p>
            <p className="text-xs text-muted-foreground">Overall Reviews</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-600">{lowRatings}</p>
            <p className="text-xs text-muted-foreground">Low Ratings (1-2)</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6 overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
        <CardContent className="bg-slate-50/90 p-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by customer, order, product, partner..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 rounded-md border-slate-300"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-full rounded-md border-slate-300 sm:w-[160px]">
                <SelectValue placeholder="Review Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="vendor">Store</SelectItem>
                <SelectItem value="delivery">Delivery</SelectItem>
                <SelectItem value="product">Product</SelectItem>
                <SelectItem value="overall">Overall</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterRating} onValueChange={setFilterRating}>
              <SelectTrigger className="w-full rounded-md border-slate-300 sm:w-[140px]">
                <SelectValue placeholder="Rating" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Ratings</SelectItem>
                <SelectItem value="5">5 Stars</SelectItem>
                <SelectItem value="4">4 Stars</SelectItem>
                <SelectItem value="3">3 Stars</SelectItem>
                <SelectItem value="2">2 Stars</SelectItem>
                <SelectItem value="1">1 Star</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Reviews List */}
      <Card className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-200 bg-slate-50/90">
          <CardTitle className="text-lg text-slate-900">
            All Reviews ({filteredReviews?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading reviews...</div>
          ) : !filteredReviews || filteredReviews.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Star className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="font-medium">No reviews found</p>
              <p className="text-sm mt-1">Reviews will appear here once customers submit them</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredReviews.map((review) => {
                const customer = getCustomer(review.customer_id);
                const order = getOrder(review.order_id);
                const product = getProduct(review.product_id);
                const partner = order ? getDeliveryPartner(order.delivery_partner_id) : null;
                const vendor = order ? getVendor(order.vendor_id) : null;
                const isExpanded = expandedReview === review.id;

                return (
                  <div
                    key={review.id}
                    className="overflow-hidden rounded-xl border border-slate-200"
                  >
                    {/* Review Header — always visible */}
                    <button
                      className="flex w-full items-start gap-4 p-4 text-left transition-colors hover:bg-white"
                      onClick={() => setExpandedReview(isExpanded ? null : review.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`flex items-center gap-1 text-sm font-semibold capitalize ${getTypeBadge(review.review_type)}`}>
                              {getTypeIcon(review.review_type)}
                              {review.review_type}
                          </span>
                          <div className={`flex items-center gap-1 font-bold ${getRatingColor(review.rating)}`}>
                            {renderStars(review.rating)}
                            <span className="ml-1 text-sm">{review.rating}/5</span>
                          </div>
                          {order && (
                            <span className="text-xs text-muted-foreground font-mono">
                              #{order.order_number}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-sm mb-1">
                          <span className="font-medium flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {customer?.full_name || 'Unknown'}
                          </span>
                          {customer?.phone && (
                            <span className="text-muted-foreground text-xs">{customer.phone}</span>
                          )}
                        </div>

                        {review.comment && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            "{review.comment}"
                          </p>
                        )}

                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(review.created_at), 'MMM d, yyyy h:mm a')}
                          </span>
                          {review.review_type === 'product' && product && (
                            <span className="flex items-center gap-1">
                              <Package className="w-3 h-3" />
                              {product.name}
                            </span>
                          )}
                          {review.review_type === 'delivery' && partner && (
                            <span className="flex items-center gap-1">
                              <Truck className="w-3 h-3" />
                              {partner.full_name}
                            </span>
                          )}
                          {review.review_type === 'vendor' && vendor && (
                            <span className="flex items-center gap-1">
                              <Store className="w-3 h-3" />
                              {vendor.business_name}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 mt-1">
                        {isExpanded
                          ? <ChevronUp className="w-5 h-5 text-muted-foreground" />
                          : <ChevronDown className="w-5 h-5 text-muted-foreground" />
                        }
                      </div>
                    </button>

                    {/* Expanded Order Details */}
                    {isExpanded && order && (
                      <div className="space-y-4 border-t border-slate-200 bg-slate-50/50 p-4">
                        {/* Order Info Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {/* Order Summary */}
                          <div className="space-y-2">
                            <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Order Details</h4>
                            <div className="bg-background rounded-lg border p-3 space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Order #</span>
                                <span className="font-mono font-medium">{order.order_number}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Status</span>
                                <span className={`text-sm font-semibold capitalize ${getStatusColor(order.status)}`}>
                                  {(order.status ?? '').replace(/_/g, ' ')}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Placed</span>
                                <span>{format(new Date(order.placed_at), 'MMM d, h:mm a')}</span>
                              </div>
                              {order.delivered_at && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Delivered</span>
                                  <span>{format(new Date(order.delivered_at), 'MMM d, h:mm a')}</span>
                                </div>
                              )}
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Payment</span>
                                <span className="capitalize">{order.payment_method} ({order.payment_status})</span>
                              </div>
                            </div>
                          </div>

                          {/* Customer & Delivery */}
                          <div className="space-y-2">
                            <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider">People</h4>
                            <div className="bg-background rounded-lg border p-3 space-y-3 text-sm">
                              <div>
                                <div className="flex items-center gap-1.5 font-medium mb-0.5">
                                  <User className="w-3.5 h-3.5 text-blue-600" />
                                  Customer
                                </div>
                                <p className="text-muted-foreground pl-5">
                                  {customer?.full_name || 'Unknown'}
                                  {customer?.phone && <span className="ml-2 font-mono text-xs">{customer.phone}</span>}
                                </p>
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5 font-medium mb-0.5">
                                  <Truck className="w-3.5 h-3.5 text-green-600" />
                                  Delivery Partner
                                </div>
                                <p className="text-muted-foreground pl-5">
                                  {partner?.full_name || 'Not assigned'}
                                  {partner?.phone && <span className="ml-2 font-mono text-xs">{partner.phone}</span>}
                                  {partner?.rating != null && (
                                    <span className="ml-2 text-xs">
                                      ({partner.rating.toFixed(1)} <Star className="w-3 h-3 inline fill-yellow-400 text-yellow-400" />)
                                    </span>
                                  )}
                                </p>
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5 font-medium mb-0.5">
                                  <Package className="w-3.5 h-3.5 text-purple-600" />
                                  Vendor
                                </div>
                                <p className="text-muted-foreground pl-5">
                                  {vendor?.business_name || 'Unknown'}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Billing */}
                          <div className="space-y-2">
                            <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Billing</h4>
                            <div className="bg-background rounded-lg border p-3 space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Subtotal</span>
                                <span>₹{order.subtotal}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Delivery Fee</span>
                                <span>{order.delivery_fee === 0 ? <span className="text-green-600">FREE</span> : `₹${order.delivery_fee}`}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Platform Fee</span>
                                <span>₹{order.platform_fee || 0}</span>
                              </div>
                              {order.discount_amount > 0 && (
                                <div className="flex justify-between text-green-600">
                                  <span>Discount</span>
                                  <span>- ₹{order.discount_amount}</span>
                                </div>
                              )}
                              <div className="flex justify-between font-bold border-t pt-2">
                                <span>Total</span>
                                <span>₹{order.total_amount}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Delivery Address */}
                        {order.delivery_address && (
                          <div>
                            <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider mb-2">Delivery Address</h4>
                            <div className="bg-background rounded-lg border p-3 text-sm flex items-start gap-2">
                              <MapPin className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                              <span>
                                {(order.delivery_address as any).address_line1}
                                {(order.delivery_address as any).address_line2 && `, ${(order.delivery_address as any).address_line2}`}
                                {(order.delivery_address as any).landmark && ` (${(order.delivery_address as any).landmark})`}
                                , {(order.delivery_address as any).city} - {(order.delivery_address as any).pincode}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Order Items */}
                        <div>
                          <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider mb-2">
                            Items Ordered ({order.order_items?.length || 0})
                          </h4>
                          <div className="bg-background rounded-lg border divide-y">
                            {order.order_items?.map((item: any) => (
                              <div key={item.id} className="p-3 flex items-center gap-3">
                                {item.product_snapshot?.primary_image_url ? (
                                  <img
                                    src={item.product_snapshot.primary_image_url}
                                    alt={item.product_snapshot?.name}
                                    className="w-10 h-10 rounded object-cover bg-muted"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                                    <Package className="w-5 h-5 text-muted-foreground" />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{item.product_snapshot?.name || 'Product'}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {item.product_snapshot?.unit_value} {item.product_snapshot?.unit_type} x {item.quantity}
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-sm font-medium">₹{item.total_price}</p>
                                  <p className="text-xs text-muted-foreground">₹{item.unit_price} each</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Timeline */}
                        <div>
                          <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider mb-2">Order Timeline</h4>
                          <div className="bg-background rounded-lg border p-3">
                            <div className="space-y-2 text-sm">
                              {[
                                { label: 'Placed', time: order.placed_at },
                                { label: 'Confirmed', time: order.confirmed_at },
                                { label: 'Preparing', time: order.preparing_at },
                                { label: 'Picked Up', time: order.picked_up_at },
                                { label: 'Delivered', time: order.delivered_at },
                                { label: 'Cancelled', time: order.cancelled_at },
                              ]
                                .filter(step => step.time)
                                .map((step, idx) => (
                                  <div key={idx} className="flex items-center gap-2">
                                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                                    <span className="font-medium w-20">{step.label}</span>
                                    <span className="text-muted-foreground">
                                      {format(new Date(step.time!), 'MMM d, yyyy h:mm:ss a')}
                                    </span>
                                  </div>
                                ))}
                              {order.cancellation_reason && (
                                <div className="flex items-center gap-2 text-red-600 mt-1">
                                  <span className="font-medium ml-[22px]">Reason:</span>
                                  <span>{order.cancellation_reason}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};

export default AdminReviews;
