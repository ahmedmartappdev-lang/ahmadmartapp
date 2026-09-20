import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Check, Clock, Star } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useCartStore } from '@/stores/cartStore';
import { useProduct, useRelatedProducts, useTrendingProducts } from '@/hooks/useProducts';
import { CustomerLayout } from '@/components/layouts/CustomerLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Product, ProductVariant } from '@/types/database';

const ProductDetailsPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { addItem, incrementQuantity, decrementQuantity, getItemQuantity } = useCartStore();

  // 1. Fetch Main Product
  const { data: product, isLoading } = useProduct(slug || '');
  
  // 2. Fetch Similar Products (Same Category)
  const { data: similarProducts, isLoading: similarLoading } = useRelatedProducts(product?.category_id, product?.id);
  
  // 3. Fetch "People Also Bought" (Using Trending logic as fallback)
  const { data: alsoBoughtProducts, isLoading: alsoBoughtLoading } = useTrendingProducts();

  // Real store rating for the header chip. Reviews are per-vendor, not
  // per-product — show the seller's aggregate, never a hardcoded number.
  const vendorId = (product as any)?.vendor_id as string | undefined;
  const { data: vendorReviewCount } = useQuery({
    queryKey: ['vendor-review-count', vendorId],
    enabled: !!vendorId,
    queryFn: async () => {
      const { count } = await supabase
        .from('reviews')
        .select('id', { count: 'exact', head: true })
        .eq('vendor_id', vendorId!)
        .eq('review_type', 'vendor');
      return count || 0;
    },
  });
  const vendorRating = Number((product as any)?.vendor?.rating || 0);

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);

  const handleAddToCart = (p: Product, variant?: ProductVariant) => {
    const cartKey = variant ? `${p.id}:${variant.id}` : p.id;
    addItem({
      id: cartKey,
      product_id: p.id,
      variant_id: variant?.id,
      name: p.name,
      image_url: p.primary_image_url || '/placeholder.svg',
      unit_value: variant?.unit_value ?? p.unit_value ?? 1,
      unit_type: variant?.unit_type ?? p.unit_type,
      selling_price: variant
        ? (variant.admin_selling_price ?? p.admin_selling_price ?? variant.selling_price)
        : (p.admin_selling_price ?? p.selling_price),
      vendor_selling_price: Number(variant?.selling_price ?? p.selling_price) || undefined,
      mrp: variant?.mrp ?? p.mrp,
      max_quantity: p.max_order_quantity ?? 999999,
      vendor_id: p.vendor_id,
      vendor_name: (p as any).vendor?.business_name || undefined,
      stock_quantity: variant?.stock_quantity ?? p.stock_quantity,
    });
    toast.success('Added to cart');
  };

  // Helper Component for Horizontal Scroll Items
  const ProductCard = ({ p }: { p: Product }) => {
    const defaultVariant = p.variants?.length ? p.variants[0] : null;
    const displayPrice = p.admin_selling_price ?? p.selling_price;
    const displayMrp = defaultVariant?.mrp ?? p.mrp;
    const cartKey = defaultVariant ? `${p.id}:${defaultVariant.id}` : p.id;
    const qty = getItemQuantity(cartKey);
    const discount = displayMrp > displayPrice
      ? Math.round(((displayMrp - displayPrice) / displayMrp) * 100)
      : 0;

    const isOutOfStock = p.status === 'out_of_stock';

    return (
      <div className={`min-w-[200px] max-w-[200px] border border-border rounded-[12px] p-[12px] relative bg-card flex flex-col h-full hover:shadow-md transition-shadow ${isOutOfStock ? 'opacity-60' : ''}`}>
        {discount > 0 && (
          <div className="absolute top-0 left-[10px] bg-primary text-primary-foreground text-[10px] px-[6px] py-[4px] font-extrabold rounded-b-[4px] z-10">
            {discount}% OFF
          </div>
        )}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] z-10 flex items-center justify-center rounded-[12px]">
            <span className="bg-destructive text-destructive-foreground px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm">
              Out of Stock
            </span>
          </div>
        )}
        <div className="h-[140px] flex items-center justify-center mb-[10px] cursor-pointer" onClick={() => navigate(`/product/${p.slug}`)}>
          <img src={p.primary_image_url || '/placeholder.svg'} alt={p.name} className="max-h-full max-w-full object-contain" />
        </div>
        <div className="bg-muted text-[9px] font-extrabold px-[6px] py-[3px] rounded-[4px] mb-[8px] inline-flex items-center gap-1 w-fit">
          <Clock className="w-3 h-3" /> 16 MINS
        </div>
        <div className="text-[13px] font-semibold leading-[1.3] h-[34px] overflow-hidden mb-[4px] text-foreground line-clamp-2" title={p.name}>
          {p.name}
        </div>
        <div className="text-[12px] text-muted-foreground mb-[15px]">
          {defaultVariant ? defaultVariant.label || `${defaultVariant.unit_value} ${defaultVariant.unit_type}` : `${p.unit_value} ${p.unit_type}`}
          {p.variants && p.variants.length > 1 && (
            <span className="ml-1 text-primary font-medium">+{p.variants.length - 1} more</span>
          )}
        </div>
        <div className="flex justify-between items-center mt-auto">
          <span className="text-[13px] font-bold">₹{displayPrice}</span>
          {isOutOfStock ? (
            <span className="text-xs text-destructive font-semibold">Unavailable</span>
          ) : qty === 0 ? (
            <button
              className="border border-border bg-transparent text-foreground px-[18px] py-[6px] rounded-[6px] font-semibold text-[13px] hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
              onClick={() => handleAddToCart(p, defaultVariant || undefined)}
            >
              ADD
            </button>
          ) : (
            <div className="flex items-center bg-primary text-primary-foreground rounded-[6px] h-[32px]">
              <button
                className="px-2 h-full font-bold hover:bg-primary/90 rounded-l-[6px]"
                onClick={() => decrementQuantity(cartKey)}
              >-</button>
              <span className="px-2 text-[13px] font-bold min-w-[20px] text-center">{qty}</span>
              <button
                className="px-2 h-full font-bold hover:bg-primary/90 rounded-r-[6px]"
                onClick={() => incrementQuantity(cartKey)}
              >+</button>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <CustomerLayout hideBottomNav>
        <div className="min-h-screen flex items-center justify-center">
          <Skeleton className="w-full h-full max-w-4xl rounded-xl" />
        </div>
      </CustomerLayout>
    );
  }

  if (!product) {
    return (
      <CustomerLayout hideBottomNav>
        <div className="min-h-screen flex flex-col items-center justify-center p-4">
          <h2 className="text-2xl font-bold mb-4">Product Not Found</h2>
          <Button onClick={() => navigate('/')}>Go Home</Button>
        </div>
      </CustomerLayout>
    );
  }

  const variants = (Array.isArray(product.variants) && product.variants.length) ? product.variants as ProductVariant[] : null;
  const activeVariant = variants
    ? variants.find((v: ProductVariant) => v.id === selectedVariantId) || variants[0]
    : null;

  // Per-variant admin override beats product-level admin price; vendor's selling_price is final fallback.
  const activePrice = activeVariant
    ? (activeVariant.admin_selling_price ?? product.admin_selling_price ?? activeVariant.selling_price)
    : (product.admin_selling_price ?? product.selling_price);
  const activeMrp = activeVariant?.mrp ?? product.mrp;
  const activeUnit = activeVariant
    ? `${activeVariant.unit_value} ${activeVariant.unit_type}`
    : `${product.unit_value || ''} ${product.unit_type || ''}`;
  const activeCartKey = activeVariant ? `${product.id}:${activeVariant.id}` : product.id;
  const currentQty = getItemQuantity(activeCartKey);

  return (
    <CustomerLayout hideBottomNav>
      <main className="max-w-[1280px] mx-auto py-10 px-4 md:px-10">
        
        {/* --- PRODUCT DETAIL SECTION --- */}
        <section className="flex flex-col md:flex-row gap-10 md:gap-16 pb-16 border-b border-border">
          
          {/* Left: Gallery */}
          <div className="flex-[1.2] text-center">
            <div className="h-[300px] md:h-[450px] flex items-center justify-center mb-5 border border-transparent">
              <img 
                src={product.primary_image_url || '/placeholder.svg'} 
                alt={product.name} 
                className="max-h-full max-w-full object-contain"
              />
            </div>
            {/* Thumbnails */}
            <div className="flex gap-2.5 justify-center overflow-x-auto">
              <div className="w-[60px] h-[60px] border border-primary rounded-[8px] p-1 cursor-pointer">
                <img src={product.primary_image_url || '/placeholder.svg'} className="w-full h-full object-contain" />
              </div>
              <div className="w-[60px] h-[60px] border border-border rounded-[8px] p-1 cursor-pointer hover:border-muted-foreground opacity-50">
                <img src={product.primary_image_url || '/placeholder.svg'} className="w-full h-full object-contain" />
              </div>
            </div>
          </div>

          {/* Right: Info */}
          <div className="flex-1 pt-5">
            <div className="text-[12px] text-muted-foreground mb-2.5 flex items-center flex-wrap gap-1">
              <span className="cursor-pointer hover:text-primary" onClick={() => navigate('/')}>Home</span> 
              <ChevronRight className="w-3 h-3" />
              <span className="cursor-pointer hover:text-primary" onClick={() => navigate(`/category/${product.category?.slug}`)}>
                {product.category?.name || 'Category'}
              </span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-foreground line-clamp-1">{product.name}</span>
            </div>
            
            {/* Brand Name */}
            {product.brand && (
              <div className="text-[13px] font-bold text-muted-foreground mb-1 uppercase tracking-wide">
                {product.brand}
              </div>
            )}

            <h1 className="text-[24px] font-extrabold mb-1 leading-tight text-foreground">{product.name}</h1>
            {(product as any).vendor?.business_name && (
              <p className="text-[13px] text-muted-foreground mb-3">Sold by <span className="font-semibold text-foreground">{(product as any).vendor.business_name}</span></p>
            )}

            {/* Store rating — shown only when the seller actually has one */}
            {vendorRating > 0 && (
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-primary/10 text-primary px-2 py-0.5 rounded flex items-center gap-1 text-xs font-bold border border-primary/20">
                  <Star className="w-3 h-3 fill-primary text-primary" />
                  {vendorRating.toFixed(1)}
                </div>
                <span className="text-xs text-muted-foreground font-medium">
                  {(vendorReviewCount ?? 0) > 0
                    ? `${vendorReviewCount} store rating${vendorReviewCount === 1 ? '' : 's'}`
                    : 'Store rating'}
                </span>
              </div>
            )}

            <div className="text-[14px] font-bold mb-4 text-foreground">Select Unit</div>

            <div className="flex flex-wrap gap-3 mb-6">
              {variants ? variants.map((v) => {
                const isSelected = v.id === (activeVariant?.id);
                const vPrice = v.admin_selling_price ?? product.admin_selling_price ?? v.selling_price;
                const vDiscount = v.mrp > vPrice ? Math.round(((v.mrp - vPrice) / v.mrp) * 100) : 0;
                return (
                  <div
                    key={v.id}
                    className={`rounded-[12px] px-5 py-3 cursor-pointer min-w-[100px] relative transition-colors ${
                      isSelected
                        ? 'border-2 border-primary bg-primary/5'
                        : 'border border-border hover:border-primary/50'
                    }`}
                    onClick={() => setSelectedVariantId(v.id)}
                  >
                    <span className="text-[13px] font-semibold block">{v.label || `${v.unit_value} ${v.unit_type}`}</span>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-[14px] font-extrabold">₹{vPrice}</span>
                      {v.mrp > vPrice && (
                        <span className="text-[12px] text-muted-foreground line-through">₹{v.mrp}</span>
                      )}
                    </div>
                    {vDiscount > 0 && (
                      <span className="text-[10px] text-primary font-bold">{vDiscount}% OFF</span>
                    )}
                    {/* Per-variant stock badge removed — admin uses status=out_of_stock to mark whole product unavailable */}
                    {isSelected && (
                      <>
                        <div className="absolute top-0 right-0 w-0 h-0 border-t-[12px] border-r-[12px] border-t-primary border-r-transparent rounded-bl-lg"></div>
                        <Check className="absolute top-[-2px] right-[-2px] w-2.5 h-2.5 text-primary-foreground" />
                      </>
                    )}
                  </div>
                );
              }) : (
                <div className="border-2 border-primary bg-primary/5 rounded-[12px] px-5 py-3 cursor-pointer min-w-[100px] relative">
                  <span className="text-[13px] font-semibold block">{product.unit_value} {product.unit_type}</span>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[14px] font-extrabold">₹{product.admin_selling_price ?? product.selling_price}</span>
                    {product.mrp > (product.admin_selling_price ?? product.selling_price) && (
                      <span className="text-[12px] text-muted-foreground line-through">₹{product.mrp}</span>
                    )}
                  </div>
                  <div className="absolute top-0 right-0 w-0 h-0 border-t-[12px] border-r-[12px] border-t-primary border-r-transparent rounded-bl-lg"></div>
                  <Check className="absolute top-[-2px] right-[-2px] w-2.5 h-2.5 text-primary-foreground" />
                </div>
              )}
            </div>

            <div className="flex justify-between items-end mb-8 border-b border-border pb-8">
              <div>
                <span className="text-[14px] font-extrabold block">₹{activePrice}</span>
                <span className="text-[10px] text-muted-foreground font-medium">(Inclusive of all taxes)</span>
              </div>

              {(() => {
                const isMainOutOfStock = product.status === 'out_of_stock';
                if (isMainOutOfStock) {
                  return (
                    <button
                      className="bg-gray-400 text-white border-none h-12 px-9 rounded-2xl font-semibold text-[15px] cursor-not-allowed opacity-100"
                      disabled
                    >
                      Out of Stock
                    </button>
                  );
                }
                if (currentQty === 0) {
                  return (
                    <button
                      className="bg-primary text-primary-foreground h-12 px-9 rounded-2xl font-semibold text-[15px] cursor-pointer hover:bg-primary/90 transition-colors shadow-sm"
                      onClick={() => handleAddToCart(product, activeVariant || undefined)}
                    >
                      Add to cart
                    </button>
                  );
                }
                return (
                  <div className="flex items-center bg-primary text-primary-foreground rounded-full h-12 overflow-hidden shadow-sm">
                    <button
                      className="w-12 h-full font-semibold hover:bg-primary/90 text-xl flex items-center justify-center"
                      onClick={() => decrementQuantity(activeCartKey)}
                    >−</button>
                    <span className="px-4 text-[15px] font-semibold min-w-[40px] text-center">{currentQty}</span>
                    <button
                      className="w-12 h-full font-semibold hover:bg-primary/90 text-xl flex items-center justify-center"
                      onClick={() => incrementQuantity(activeCartKey)}
                    >+</button>
                  </div>
                );
              })()}
            </div>

            {/* Description Section */}
            {product.description && (
              <div className="mb-10">
                <div className="text-[16px] font-bold mb-3 text-foreground">Product Description</div>
                <p className="text-[13px] text-muted-foreground leading-[1.6]">{product.description}</p>
              </div>
            )}

            <div className="mt-6">
              <div className="text-[14px] font-bold mb-4 text-foreground">Why shop from Ahmad Mart?</div>
              <div className="space-y-6">
                <div className="flex gap-5 items-center">
                  <div className="w-[60px] h-[60px] rounded-full bg-accent flex items-center justify-center shrink-0">
                    <img src="https://cdn-icons-png.flaticon.com/512/1043/1043425.png" className="w-[30px]" alt="Clock" />
                  </div>
                  <div>
                    <h4 className="text-[14px] font-bold mb-1">Round The Clock Delivery</h4>
                    <p className="text-[12px] text-muted-foreground leading-[1.4]">Get items delivered to your doorstep from dark stores near you, whenever you need them.</p>
                  </div>
                </div>
                <div className="flex gap-5 items-center">
                  <div className="w-[60px] h-[60px] rounded-full bg-secondary flex items-center justify-center shrink-0">
                    <img src="https://cdn-icons-png.flaticon.com/512/1828/1828884.png" className="w-[30px]" alt="Offers" />
                  </div>
                  <div>
                    <h4 className="text-[14px] font-bold mb-1">Best Prices & Offers</h4>
                    <p className="text-[12px] text-muted-foreground leading-[1.4]">Best price destination with offers directly from the manufacturers.</p>
                  </div>
                </div>
                <div className="flex gap-5 items-center">
                  <div className="w-[60px] h-[60px] rounded-full bg-accent flex items-center justify-center shrink-0">
                    <img src="https://cdn-icons-png.flaticon.com/512/2674/2674486.png" className="w-[30px]" alt="Assortment" />
                  </div>
                  <div>
                    <h4 className="text-[14px] font-bold mb-1">Wide Assortment</h4>
                    <p className="text-[12px] text-muted-foreground leading-[1.4]">Choose from 30,000+ products across food, personal care, household & other categories.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* --- SIMILAR PRODUCTS --- */}
        <section className="py-10">
          <h2 className="text-[20px] font-extrabold mb-5 text-foreground">Similar products</h2>
          <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
            {similarLoading ? (
               [...Array(5)].map((_, i) => <Skeleton key={i} className="min-w-[200px] h-[300px] rounded-xl" />)
            ) : similarProducts && similarProducts.length > 0 ? (
              similarProducts.map(p => <ProductCard key={p.id} p={p} />)
            ) : (
              <p className="text-muted-foreground text-sm">No similar products found.</p>
            )}
          </div>
        </section>

        {/* --- PEOPLE ALSO BOUGHT --- */}
        <section className="py-10">
          <h2 className="text-[20px] font-extrabold mb-5 text-foreground">People also bought</h2>
          <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
            {alsoBoughtLoading ? (
               [...Array(5)].map((_, i) => <Skeleton key={i} className="min-w-[200px] h-[300px] rounded-xl" />)
            ) : alsoBoughtProducts && alsoBoughtProducts.length > 0 ? (
              alsoBoughtProducts.map(p => <ProductCard key={p.id} p={p} />)
            ) : (
              <p className="text-muted-foreground text-sm">No recommendations available.</p>
            )}
          </div>
        </section>

      </main>
    </CustomerLayout>
  );
};

export default ProductDetailsPage;
