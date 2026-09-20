import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { Category } from '@/types/database';

const CARD_GRADIENTS = [
  'from-rose-100 to-rose-50',
  'from-emerald-100 to-emerald-50',
  'from-amber-100 to-amber-50',
  'from-sky-100 to-sky-50',
  'from-violet-100 to-violet-50',
  'from-orange-100 to-orange-50',
  'from-teal-100 to-teal-50',
  'from-pink-100 to-pink-50',
];

interface CategoryCardsProps {
  categories?: Category[] | null;
  isLoading: boolean;
}

export const CategoryCards: React.FC<CategoryCardsProps> = ({ categories, isLoading }) => {
  const navigate = useNavigate();

  return (
    <section className="py-3 px-4">
      <h3 className="text-[17px] font-bold text-foreground mb-3">Shop by Categories</h3>

      {isLoading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-[140px] rounded-xl" />
          ))}
        </div>
      ) : !categories || categories.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">No categories found.</div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
          {categories.map((cat, index) => (
            <div
              key={cat.id}
              className={`relative rounded-xl overflow-hidden cursor-pointer group transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 bg-gradient-to-b ${CARD_GRADIENTS[index % CARD_GRADIENTS.length]}`}
              onClick={() => navigate(`/category/${cat.slug}`)}
            >
              {/* Image area */}
              <div className="pt-3 px-3 flex items-center justify-center h-[90px]">
                <img
                  src={cat.image_url || cat.icon_url || '/placeholder.svg'}
                  alt={cat.name}
                  className="max-h-[75px] w-auto object-contain drop-shadow-md group-hover:scale-105 transition-transform duration-200"
                />
              </div>

              {/* Label */}
              <div className="px-2 pb-2.5 pt-1">
                <p className="text-[11px] font-semibold text-foreground text-center leading-tight line-clamp-2">
                  {cat.name}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
