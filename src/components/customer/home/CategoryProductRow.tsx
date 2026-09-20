import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Minus, Star } from 'lucide-react';
import { useCartStore } from '@/stores/cartStore';
import { toast } from 'sonner';
import type { HomeCategorySection } from '@/hooks/useProducts';

interface CategoryProductRowProps {
  section: HomeCategorySection;
}

export const CategoryProductRow: React.FC<CategoryProductRowProps> = ({ section }) => {
  const navigate = useNavigate();
  const { items, addItem, incrementQuantity, decrementQuantity } = useCartStore();

  const getQty = (productId: string) =>
    items.find((i) => i.product_id === productId)?.quantity ?? 0;

  const handleAdd = (e: React.MouseEvent, product: any) => {
    e.stopPropagation();
    if (product.status === 'out_of_stock') {
      toast.error('This product is currently unavailable');
      return;
    }
    const effectivePrice = product.admin_selling_price ?? product.selling_price;
    addItem({
      id: product.id,
      product_id: product.id,
      name: product.name,
      image_url: product.primary_image_url || '/placeholder.svg',
      unit_value: product.unit_value ?? 1,
      unit_type: product.unit_type,
      selling_price: effectivePrice,
      vendor_selling_price: Number(product.selling_price) || undefined,
      mrp: product.mrp,
      max_quantity: product.max_order_quantity ?? 10,
      vendor_id: product.vendor_id,
      vendor_name: product.vendor?.business_name,
      stock_quantity: product.stock_quantity,
    });
    toast.success('Added to cart');
  };

  return (
    <section className="px-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[16px] font-bold text-foreground tracking-tight">{section.name}</h3>
        <button
          onClick={() => navigate(`/category/${section.slug}`)}
          className="text-[13px] font-semibold text-primary"
        >
          See all
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 pb-2 snap-x">
        {section.products.map((product: any) => {
          const qty = getQty(product.id);
          const effectivePrice = product.admin_selling_price ?? product.selling_price;
          const isOOS = product.status === 'out_of_stock';
          const discount = product.mrp > effectivePrice
            ? Math.round(((product.mrp - effectivePrice) / product.mrp) * 100)
            : 0;

          return (
            <div
              key={product.id}
              onClick={() => navigate(`/product/${product.slug}`)}
              className="snap-start shrink-0 w-[150px] md:w-[170px] bg-white rounded-2xl border border-gray-100 p-3 cursor-pointer hover:shadow-sm transition-all"
            >
              <div className="relative h-[130px] w-full rounded-2xl bg-[#f9f9f9] overflow-hidden mb-2 flex items-center justify-center">
                <img
                  src={product.primary_image_url || '/placeholder.svg'}
                  alt={product.name}
                  className="max-w-full max-h-full object-contain p-1 rounded-xl"
                  loading="lazy"
                />
                {discount > 0 && (
                  <span className="absolute top-1.5 left-1.5 bg-primary text-primary-foreground text-[11px] font-extrabold px-2 py-1 rounded-md shadow-sm">
                    {discount}% OFF
                  </span>
                )}
              </div>

              <h4 className="text-[12.5px] font-semibold text-foreground line-clamp-3 leading-snug min-h-[2.4em] break-words">
                {product.name}
              </h4>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {product.unit_value ? `${product.unit_value} ${product.unit_type}` : '1 unit'}
              </p>
              {Number(product.vendor?.rating || 0) > 0 && (
                <p className="flex items-center gap-0.5 mt-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={`w-3 h-3 ${
                        s <= Math.round(Number(product.vendor.rating))
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-gray-300'
                      }`}
                    />
                  ))}
                  <span className="text-[10px] font-semibold text-gray-600 ml-0.5">
                    {Number(product.vendor.rating).toFixed(1)}
                  </span>
                </p>
              )}

              <div className="flex items-center justify-between mt-2 gap-1">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-extrabold text-foreground tracking-tight">₹{effectivePrice}</p>
                  {product.mrp > effectivePrice && (
                    <p className="text-[12px] font-semibold text-slate-500 line-through leading-tight">₹{product.mrp}</p>
                  )}
                </div>

                <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                  {isOOS ? (
                    <span className="text-[10px] font-bold text-destructive uppercase">Out</span>
                  ) : qty === 0 ? (
                    <button
                      onClick={(e) => handleAdd(e, product)}
                      className="bg-white text-primary border border-primary/40 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors text-[12px] font-bold px-3 h-8 rounded-full"
                    >
                      ADD
                    </button>
                  ) : (
                    <div className="flex items-center border border-primary rounded-full h-8 overflow-hidden">
                      <button
                        onClick={() => decrementQuantity(product.id)}
                        className="w-7 h-full flex items-center justify-center text-primary hover:bg-primary/10"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-[12px] font-bold text-primary min-w-[18px] text-center">{qty}</span>
                      <button
                        onClick={() => incrementQuantity(product.id)}
                        className="w-7 h-full flex items-center justify-center text-primary hover:bg-primary/10"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
