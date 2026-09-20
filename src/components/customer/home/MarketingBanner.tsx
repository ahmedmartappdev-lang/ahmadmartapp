import React from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Home-page marketing block, rebuilt responsively from the client's
 * banner design. Replaces the old "Use App" install card and the
 * "Can't find it?" CTA (its Search Products button covers that job).
 *
 * Three stacked sections inside one rounded card:
 *   1. Brand strip — logo panel + benefit bullets on brand green.
 *   2. "Didn't find what you were looking for?" + Search Products CTA.
 *   3. "Fresh & Fast" sign-off with a delivery icon.
 */
export const MarketingBanner: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-white">
      {/* 1. Brand strip */}
      <div className="flex items-stretch">
        {/* The square logo artwork IS the panel — its patterned background
            fills the box edge-to-edge instead of floating inside it. */}
        <div className="w-2/5 sm:w-1/3 bg-[#0f2f27] overflow-hidden">
          <img
            src="/icon-512.png"
            alt="Ahmad Mart"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex-1 bg-[#177a33] px-4 sm:px-8 py-4 sm:py-6 flex flex-col justify-center gap-1.5 sm:gap-2.5">
          {['Extra Savings', 'Fast Deliveries', 'Free Deliveries'].map((item) => (
            <p key={item} className="flex items-center gap-2 text-white font-semibold text-[13px] sm:text-lg leading-snug">
              <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-white shrink-0" />
              {item}
            </p>
          ))}
        </div>
      </div>

      {/* 2. Didn't find it → search */}
      <div className="px-5 sm:px-8 py-6 sm:py-8 text-center sm:text-left">
        <h3 className="text-[22px] sm:text-3xl font-extrabold text-gray-400 leading-tight tracking-tight">
          Didn{'’'}t Find What You Were Looking For?
        </h3>
        <div className="mt-4 flex justify-center sm:justify-start">
          <button
            onClick={() => navigate('/search')}
            className="bg-[#14532d] hover:bg-[#0f3d21] transition-colors text-white font-semibold text-[14px] sm:text-base px-7 sm:px-9 h-11 sm:h-12 rounded-xl shadow-sm"
          >
            Search Products
          </button>
        </div>
      </div>

      {/* 3. Fresh & Fast sign-off — branded delivery scooter illustration */}
      <div className="px-5 sm:px-8 pb-6 sm:pb-8 flex items-center justify-center sm:justify-start gap-4">
        <img
          src="/fresh-fast-scooter.png"
          alt=""
          className="w-24 sm:w-28 shrink-0 object-contain"
          loading="lazy"
        />
        <p className="text-2xl sm:text-3xl font-extrabold text-[#14532d] leading-tight tracking-tight">
          Fresh &amp; Fast
        </p>
      </div>
    </div>
  );
};

export default MarketingBanner;
