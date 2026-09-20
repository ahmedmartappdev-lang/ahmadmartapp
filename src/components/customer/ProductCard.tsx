import React from 'react';
import { motion } from 'framer-motion';
import { Plus, Minus, Clock, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCartStore } from '@/stores/cartStore';
import { Product } from '@/types/database';
import { useTimeSlots, isWithinTimeSlots, getTimeSlotDisplayText } from '@/hooks/useTimeSlots';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ProductCardProps {
  product: Product;
  /** 'grid' (default) = stacked card. 'list' = horizontal row (image left, details right). */
  layout?: 'grid' | 'list';
  /** When true, skip the "Sold by {vendor}" line. Used on the vendor's own store page
   *  where the vendor name is already in the page header. */
  hideVendor?: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, layout = 'grid', hideVendor = false }) => {
  const { addItem, getItemQuantity, incrementQuantity, decrementQuantity } = useCartStore();
  const { data: allTimeSlots } = useTimeSlots();

  // Fetch product's assigned time slots
  const { data: productSlotIds } = useQuery({
    queryKey: ['product-time-slots', product.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_time_slots' as any)
        .select('time_slot_id')
        .eq('product_id', product.id);
      if (error) return [];
      return ((data || []) as any[]).map((d: any) => d.time_slot_id as string);
    },
  });

  const isAvailableNow = !productSlotIds || productSlotIds.length === 0 || (allTimeSlots ? isWithinTimeSlots(allTimeSlots, productSlotIds) : true);
  const slotText = allTimeSlots && productSlotIds && productSlotIds.length > 0
    ? getTimeSlotDisplayText(allTimeSlots, productSlotIds)
    : '';

  const variants = (Array.isArray(product.variants) && product.variants.length) ? product.variants : null;
  const defaultVariant = variants ? variants[0] : null;

  const displayPrice = product.admin_selling_price ?? product.selling_price;
  const displayMrp = defaultVariant?.mrp ?? product.mrp;
  const displayUnit = defaultVariant
    ? `${defaultVariant.unit_value} ${defaultVariant.unit_type}`
    : `${product.unit_value || ''}${product.unit_type || ''}`;
  const isOutOfStock = product.status === 'out_of_stock';

  const cartKey = defaultVariant ? `${product.id}:${defaultVariant.id}` : product.id;
  const quantity = getItemQuantity(cartKey);

  const discountPercent = displayMrp > displayPrice
    ? Math.round(((displayMrp - displayPrice) / displayMrp) * 100)
    : 0;

  const hasMultipleVariants = variants && variants.length > 1;
  const isDisabled = isOutOfStock || !isAvailableNow;

  const handleAddToCart = () => {
    if (!isAvailableNow) return;
    addItem({
      id: cartKey,
      product_id: product.id,
      variant_id: defaultVariant?.id,
      name: product.name,
      image_url: product.primary_image_url || '/placeholder.svg',
      unit_value: defaultVariant?.unit_value ?? product.unit_value ?? 1,
      unit_type: defaultVariant?.unit_type ?? product.unit_type,
      selling_price: defaultVariant
        ? (defaultVariant.admin_selling_price ?? product.admin_selling_price ?? defaultVariant.selling_price)
        : (product.admin_selling_price ?? product.selling_price),
      vendor_selling_price: Number(defaultVariant?.selling_price ?? product.selling_price) || undefined,
      mrp: displayMrp,
      max_quantity: product.max_order_quantity ?? 999999,
      vendor_id: product.vendor_id,
      vendor_name: (product as any).vendor?.business_name || undefined,
    });
  };

  // Horizontal list layout — image left, details right, ADD button right-aligned.
  // Used on /store/:slug where the client wants a compact vertical list rather
  // than a grid. Every other caller keeps the default grid layout.
  if (layout === 'list') {
    return (
      <motion.div
        className={`bg-white rounded-2xl border border-gray-100 p-3 flex items-stretch gap-3 ${!isAvailableNow ? 'opacity-50 grayscale' : ''}`}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
      >
        <div className="relative h-[128px] w-[128px] rounded-2xl bg-[#f9f9f9] shrink-0 overflow-hidden flex items-center justify-center">
          <img
            src={product.primary_image_url || '/placeholder.svg'}
            alt={product.name}
            className="max-w-full max-h-full object-contain p-1 rounded-xl"
            loading="lazy"
          />
          {discountPercent > 0 && (
            <span className="absolute top-1 left-1 bg-emerald-600 text-white text-[11px] font-extrabold leading-none px-2 py-1 rounded-md shadow-sm">
              {discountPercent}% OFF
            </span>
          )}
          {isOutOfStock && (
            <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center">
              <span className="bg-destructive text-destructive-foreground px-1.5 py-0.5 rounded text-[9px] font-bold uppercase">OOS</span>
            </div>
          )}
        </div>
        {/* Name gets the full width right of the image (no button column beside
            it, so long names wrap at ~18-20 chars, not 7). The ADD button sits
            lower, beside the price at the bottom of the card. */}
        <div className="flex-1 min-w-0 flex flex-col py-0.5">
          <h3 className="font-semibold text-[14px] leading-tight text-foreground break-words">
            {product.name}
          </h3>
          {!hideVendor && (product as any).vendor?.business_name && (
            <p className="text-[10px] text-muted-foreground mt-0.5">Sold by {(product as any).vendor.business_name}</p>
          )}
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {displayUnit}
            {hasMultipleVariants && (
              <span className="ml-1 text-primary font-medium">+{variants!.length - 1} more</span>
            )}
          </p>
          {/* Seller's rating stars — reviews are per-store in this app */}
          {Number((product as any).vendor?.rating || 0) > 0 && (
            <p className="flex items-center gap-1 mt-1">
              {[1, 2, 3, 4, 5].map(s => (
                <Star
                  key={s}
                  className={`w-3.5 h-3.5 ${
                    s <= Math.round(Number((product as any).vendor.rating))
                      ? 'fill-yellow-400 text-yellow-400'
                      : 'text-gray-300'
                  }`}
                />
              ))}
              <span className="text-[11px] font-semibold text-gray-600 ml-0.5">
                {Number((product as any).vendor.rating).toFixed(1)}
              </span>
            </p>
          )}
          <div className="mt-auto pt-1.5 flex items-end justify-between gap-2">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="font-extrabold text-xl text-foreground tracking-tight">₹{displayPrice}</span>
              {discountPercent > 0 && (
                <span className="text-sm font-semibold text-slate-500 line-through">₹{displayMrp}</span>
              )}
            </div>
            <div className="shrink-0 w-[88px]">
              {isDisabled ? (
                <Button disabled className="w-full h-9 bg-muted/80 text-muted-foreground/70 border border-gray-200 rounded-full text-xs" size="sm" variant="outline">
                  {isOutOfStock ? 'OOS' : 'N/A'}
                </Button>
              ) : quantity === 0 ? (
                <Button
                  onClick={(e) => { e.stopPropagation(); handleAddToCart(); }}
                  className="w-full h-9 bg-transparent text-primary border border-primary/40 hover:bg-primary hover:text-primary-foreground hover:border-primary font-semibold transition-colors rounded-full text-xs"
                  size="sm"
                  variant="outline"
                >
                  ADD
                </Button>
              ) : (
                <div className="quantity-control h-9" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => decrementQuantity(cartKey)} className="quantity-btn">
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="flex-1 text-center font-semibold text-primary text-sm">{quantity}</span>
                  <button
                    onClick={() => incrementQuantity(cartKey)}
                    className="quantity-btn"
                    disabled={quantity >= (product.max_order_quantity ?? 999999)}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className={`product-card bg-white rounded-2xl border border-gray-100 overflow-hidden ${!isAvailableNow ? 'opacity-50 grayscale' : ''}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Image Section */}
      <div className="relative flex items-center justify-center pt-4 pb-2 bg-white">
        <div className="w-[160px] h-[160px] rounded-2xl overflow-hidden bg-white border border-gray-50 flex items-center justify-center">
          <img
            src={product.primary_image_url || '/placeholder.svg'}
            alt={product.name}
            className="max-w-full max-h-full object-contain p-1 rounded-xl"
            loading="lazy"
          />
        </div>
        {discountPercent > 0 && (
          <div className="discount-badge">
            {discountPercent}% OFF
          </div>
        )}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] z-10 flex items-center justify-center rounded-xl">
            <span className="bg-destructive text-destructive-foreground px-3 py-1 rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm">
              Out of Stock
            </span>
          </div>
        )}
        {!isOutOfStock && !isAvailableNow && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] z-10 flex items-center justify-center rounded-xl">
            <div className="text-center px-2 bg-white p-2 rounded-xl shadow-sm">
              <Clock className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground">Not available now</span>
            </div>
          </div>
        )}
      </div>

      {/* Details Section */}
      <div className="p-3 bg-white">
        <h3 className="font-medium text-sm line-clamp-3 mb-0.5 text-foreground break-words">
          {product.name}
        </h3>
        {!hideVendor && (product as any).vendor?.business_name && (
          <p className="text-[10px] text-muted-foreground mb-0.5">Sold by {(product as any).vendor.business_name}</p>
        )}
        <p className="text-xs text-muted-foreground mb-2">
          {displayUnit}
          {hasMultipleVariants && (
            <span className="ml-1 text-primary font-medium">+{variants!.length - 1} more</span>
          )}
        </p>

        {/* Seller's rating stars — reviews are per-store in this app */}
        {Number((product as any).vendor?.rating || 0) > 0 && (
          <p className="flex items-center gap-0.5 mb-2">
            {[1, 2, 3, 4, 5].map(s => (
              <Star
                key={s}
                className={`w-3.5 h-3.5 ${
                  s <= Math.round(Number((product as any).vendor.rating))
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'text-gray-300'
                }`}
              />
            ))}
            <span className="text-[11px] font-semibold text-gray-600 ml-1">
              {Number((product as any).vendor.rating).toFixed(1)}
            </span>
          </p>
        )}

        {/* Time slot info */}
        {slotText && (
          <p className="text-[10px] text-muted-foreground mb-1 flex items-start gap-1">
            <Clock className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <span>Available at: {slotText}</span>
          </p>
        )}

        {/* Price Row */}
        <div className="flex items-center gap-2 mb-3">
          <span className="font-extrabold text-2xl text-foreground tracking-tight">
            ₹{displayPrice}
          </span>
          {discountPercent > 0 && (
            <span className="text-sm font-semibold text-slate-500 line-through">
              ₹{displayMrp}
            </span>
          )}
        </div>

        {/* Add to Cart / Quantity Control */}
        {isDisabled ? (
          <Button disabled className="w-full h-10 bg-muted/80 text-muted-foreground/70 cursor-not-allowed border border-gray-200 rounded-full" size="sm" variant="outline">
            {isOutOfStock ? 'Out of Stock' : 'Unavailable'}
          </Button>
        ) : quantity === 0 ? (
          <Button
            onClick={(e) => { e.stopPropagation(); handleAddToCart(); }}
            className="w-full h-10 bg-transparent text-primary border border-primary/40 hover:bg-primary hover:text-primary-foreground hover:border-primary font-semibold transition-colors rounded-full"
            size="sm"
            variant="outline"
          >
            ADD
          </Button>
        ) : (
          <div className="quantity-control" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => decrementQuantity(cartKey)}
              className="quantity-btn"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="flex-1 text-center font-semibold text-primary">
              {quantity}
            </span>
            <button
              onClick={() => incrementQuantity(cartKey)}
              className="quantity-btn"
              disabled={quantity >= (product.max_order_quantity ?? 999999)}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default ProductCard;
