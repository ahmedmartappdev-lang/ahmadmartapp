import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Package } from 'lucide-react';
import { Product, Category } from '@/types/database';
import { useNavigate } from 'react-router-dom';

interface ProductGridSectionProps {
  title: string;
  products?: (Product & { category: Category })[] | null;
  isLoading: boolean;
}

export const ProductGridSection: React.FC<ProductGridSectionProps> = ({
  title,
  products,
  isLoading,
}) => {
  const navigate = useNavigate();

  return (
    <section className="py-4 px-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-base font-bold text-foreground">{title}</h3>
        <span className="text-primary font-semibold text-sm cursor-pointer hover:underline">see all</span>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <Skeleton className="w-[72px] h-[72px] rounded-full" />
              <Skeleton className="h-3 w-14" />
            </div>
          ))}
        </div>
      ) : !products || products.length === 0 ? (
        <div className="text-center py-8 bg-muted/20 rounded-lg text-muted-foreground">
          No {title.toLowerCase()} available
        </div>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
          {products.map((product) => (
            <div
              key={product.id}
              className="flex flex-col items-center cursor-pointer group"
              onClick={() => navigate(`/product/${product.slug}`)}
            >
              <div className="w-[72px] h-[72px] rounded-full bg-muted/60 overflow-hidden flex items-center justify-center shadow-sm group-hover:shadow-md transition-all duration-200">
                {product.primary_image_url ? (
                  <img
                    src={product.primary_image_url}
                    alt={product.name}
                    className="w-full h-full object-cover scale-110"
                  />
                ) : (
                  <Package className="w-7 h-7 text-muted-foreground" />
                )}
              </div>
              <p className="mt-1.5 text-[11px] font-semibold text-foreground text-center w-[76px] truncate">
                {product.name}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
