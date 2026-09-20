import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { ProductCard } from '@/components/customer/ProductCard';
import { Product, Category } from '@/types/database';

interface SearchResultsSectionProps {
  searchQuery: string;
  searchResults?: (Product & { category: Category })[] | null;
  isLoading: boolean;
}

export const SearchResultsSection: React.FC<SearchResultsSectionProps> = ({
  searchQuery,
  searchResults,
  isLoading,
}) => {
  const navigate = useNavigate();

  return (
    <section className="mb-12 px-4 pt-5">
      <div className="flex items-center gap-2 mb-5">
        <h2 className="text-2xl font-bold text-foreground">Search Results</h2>
        <span className="text-muted-foreground">for "{searchQuery}"</span>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-[240px] rounded-xl" />
          ))}
        </div>
      ) : !searchResults || searchResults.length === 0 ? (
        <div className="text-center py-20 bg-muted/20 rounded-lg flex flex-col items-center justify-center">
          <h3 className="text-xl font-bold mb-2">No results found</h3>
          <p className="text-muted-foreground">Try checking your spelling or use different keywords.</p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 text-primary font-bold hover:underline"
          >
            Clear Search
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {searchResults.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </section>
  );
};
