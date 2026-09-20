import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Search, X, Clock, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProductCard } from '@/components/customer/ProductCard';
import { CustomerLayout } from '@/components/layouts/CustomerLayout';
import { useSearchProducts } from '@/hooks/useProducts';
import { Skeleton } from '@/components/ui/skeleton';

const SearchPage: React.FC = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  
  // Use debounced query for the main grid search
  const { data: products, isLoading } = useSearchProducts(debouncedQuery);
  
  // Load recent searches from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('ahmed-mart-recent-searches');
    if (saved) {
      setRecentSearches(JSON.parse(saved));
    }
  }, []);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      
      // Save to recent searches (logic handled on click usually, but can be here too)
      if (query.length >= 3) {
         // optional auto-save logic
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [query]);

  const saveToRecent = (term: string) => {
     const updated = [term, ...recentSearches.filter(s => s !== term)].slice(0, 5);
     setRecentSearches(updated);
     localStorage.setItem('ahmed-mart-recent-searches', JSON.stringify(updated));
  };

  const handleRecentSearch = (search: string) => {
    setQuery(search);
    setDebouncedQuery(search);
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem('ahmed-mart-recent-searches');
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // Force update if needed, though effect handles it
      setDebouncedQuery(query);
      if (query.length >= 2) saveToRecent(query);
    }
  };

  const trendingSearches = ['Milk', 'Bread', 'Eggs', 'Rice', 'Oil', 'Sugar'];

  return (
    <CustomerLayout hideHeader>
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background border-b border-border p-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search for products..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="pl-10 pr-10"
              autoFocus
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="p-4">
        {/* No query - show suggestions */}
        {!query && (
          <div className="space-y-6">
            {/* Recent Searches */}
            {recentSearches.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-foreground">Recent Searches</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearRecentSearches}
                    className="text-muted-foreground"
                  >
                    Clear
                  </Button>
                </div>
                <div className="space-y-2">
                  {recentSearches.map((search, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleRecentSearch(search)}
                      className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-muted transition-colors"
                    >
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="text-foreground">{search}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Trending Searches */}
            <section>
              <h2 className="font-semibold text-foreground mb-3">Trending Searches</h2>
              <div className="flex flex-wrap gap-2">
                {trendingSearches.map((search, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleRecentSearch(search)}
                    className="flex items-center gap-2 px-4 py-2 bg-muted rounded-full hover:bg-primary/10 transition-colors"
                  >
                    <TrendingUp className="w-3 h-3 text-primary" />
                    <span className="text-sm text-foreground">{search}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* Query entered - show results */}
        {query && (
          <div>
            {isLoading ? (
              <div className="grid grid-cols-2 gap-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="bg-card rounded-xl border border-border overflow-hidden">
                    <Skeleton className="aspect-square" />
                    <div className="p-3 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                      <Skeleton className="h-6 w-1/3" />
                      <Skeleton className="h-8 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : products && products.length > 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid grid-cols-2 gap-3"
              >
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </motion.div>
            ) : query.length >= 1 ? (
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="w-10 h-10 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-lg mb-2">No results found</h3>
                <p className="text-muted-foreground">
                  Try searching for something else
                </p>
              </div>
            ) : null}
          </div>
        )}
      </main>
    </CustomerLayout>
  );
};

export default SearchPage;
