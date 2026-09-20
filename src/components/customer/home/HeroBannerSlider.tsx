import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

interface Banner {
  id: string;
  image_url: string;
  title?: string | null;
  link_url?: string | null;
  display_order?: number;
}

interface HeroBannerSliderProps {
  banners?: Banner[] | null;
}

export const HeroBannerSlider: React.FC<HeroBannerSliderProps> = ({ banners }) => {
  const navigate = useNavigate();
  const [currentSlide, setCurrentSlide] = useState(0);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragDelta = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const slides = banners && banners.length > 0
    ? [...banners].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    : null;
  const slideCount = slides ? slides.length : 1;

  // Reset currentSlide if it goes out of bounds (e.g. when banners change)
  useEffect(() => {
    if (currentSlide >= slideCount) {
      setCurrentSlide(0);
    }
  }, [slideCount, currentSlide]);

  const nextSlide = useCallback(() => {
    if (slideCount > 1) {
      setCurrentSlide((prev) => (prev + 1) % slideCount);
    }
  }, [slideCount]);

  const prevSlide = useCallback(() => {
    if (slideCount > 1) {
      setCurrentSlide((prev) => (prev - 1 + slideCount) % slideCount);
    }
  }, [slideCount]);

  useEffect(() => {
    if (slideCount <= 1) return;
    const interval = setInterval(nextSlide, 4000);
    return () => clearInterval(interval);
  }, [nextSlide, slideCount]);

  // Touch handlers for mobile swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current;
    const threshold = 50;
    if (diff > threshold) {
      nextSlide();
    } else if (diff < -threshold) {
      prevSlide();
    }
  };

  // Mouse drag handlers for desktop swipe
  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragDelta.current = 0;
    if (containerRef.current) {
      containerRef.current.style.cursor = 'grabbing';
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    dragDelta.current = e.clientX - dragStartX.current;
  };

  const handleMouseUp = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (containerRef.current) {
      containerRef.current.style.cursor = 'grab';
    }
    const threshold = 50;
    if (dragDelta.current < -threshold) {
      nextSlide();
    } else if (dragDelta.current > threshold) {
      prevSlide();
    }
    dragDelta.current = 0;
  };

  const handleMouseLeave = () => {
    if (isDragging.current) {
      handleMouseUp();
    }
  };

  return (
    <section className="px-4 pt-4 pb-2">
      <div
        ref={containerRef}
        className="relative rounded-2xl overflow-hidden shadow-md cursor-grab select-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {slides ? (
          <div
            className="flex transition-transform duration-500 ease-in-out w-full"
            style={{
              width: `${slideCount * 100}%`,
              transform: `translateX(-${currentSlide * (100 / slideCount)}%)`,
            }}
          >
            {slides.map((banner) => (
              <div
                key={banner.id}
                className="flex-shrink-0"
                style={{ width: `${100 / slideCount}%` }}
              >
                <img
                  src={banner.image_url}
                  alt={banner.title || 'Promo banner'}
                  className="w-full h-[160px] md:h-[280px] object-cover"
                  onClick={() => !dragDelta.current && banner.link_url && navigate(banner.link_url)}
                  draggable={false}
                />
              </div>
            ))}
          </div>
        ) : (
          <img
            src="/banner.jpg"
            alt="Welcome to AhmadMart"
            className="w-full h-[160px] md:h-[280px] object-cover"
          />
        )}
      </div>

      {slideCount > 1 && (
        <div className="flex justify-center gap-1.5 mt-3">
          {Array.from({ length: slideCount }).map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentSlide(i)}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === currentSlide
                  ? 'w-4 bg-primary'
                  : 'w-2 bg-muted-foreground/30'
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
};
