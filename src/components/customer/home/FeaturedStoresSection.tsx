import React from 'react';
import { Store } from 'lucide-react';

interface FeaturedStore {
  id: string;
  business_name: string;
  owner_photo_url?: string | null;
  store_address?: string | null;
  rating?: number | null;
}

interface FeaturedStoresSectionProps {
  stores?: FeaturedStore[] | null;
}

export const FeaturedStoresSection: React.FC<FeaturedStoresSectionProps> = ({ stores }) => {
  if (!stores || stores.length === 0) return null;

  return (
    <section className="py-4 px-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-bold text-foreground">Top Picks For You</h3>
        <span className="text-primary font-semibold text-sm cursor-pointer hover:underline">see all</span>
      </div>

      <div className="flex gap-5 overflow-x-auto scrollbar-hide pb-2">
        {stores.map((store) => (
          <div
            key={store.id}
            className="flex flex-col items-center flex-shrink-0 cursor-pointer group"
          >
            <div className="w-[72px] h-[72px] rounded-full bg-muted/60 overflow-hidden flex items-center justify-center shadow-sm group-hover:shadow-md transition-all duration-200">
              {store.owner_photo_url ? (
                <img
                  src={store.owner_photo_url}
                  alt={store.business_name}
                  className="w-full h-full object-cover scale-110"
                />
              ) : (
                <Store className="w-7 h-7 text-muted-foreground" />
              )}
            </div>
            <p className="mt-1.5 text-[11px] font-semibold text-foreground text-center w-[76px] truncate">
              {store.business_name}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
};
