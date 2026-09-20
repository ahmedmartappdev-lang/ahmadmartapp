import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShoppingCart } from 'lucide-react';
import { Category } from '@/types/database';

interface CategoryCardProps {
  category: Category;
}

export const CategoryCard: React.FC<CategoryCardProps> = ({ category }) => {
  return (
    <Link to={`/category/${category.slug}`}>
      <motion.div
        className="category-card"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/30 flex items-center justify-center overflow-hidden">
          {category.image_url ? (
            <img
              src={category.image_url}
              alt={category.name}
              className="w-full h-full object-cover"
            />
          ) : category.icon_url ? (
            <img
              src={category.icon_url}
              alt={category.name}
              className="w-10 h-10 object-contain"
            />
          ) : (
            <ShoppingCart className="w-6 h-6 text-muted-foreground" />
          )}
        </div>
        <p className="text-xs text-center text-foreground font-medium line-clamp-2">
          {category.name}
        </p>
      </motion.div>
    </Link>
  );
};

export default CategoryCard;
