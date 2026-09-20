import React from 'react';
import { Star } from 'lucide-react';

export const AppInstallBanner: React.FC = () => {
  // The 'X' (close) button and state have been removed.
  // The banner now uses the "whole" space for the logo, text, and button.

  return (
    <div className="md:hidden flex items-center justify-between bg-white p-3 border border-gray-200 rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.04)] w-full mx-4" style={{ width: 'calc(100% - 32px)' }}>
      <div className="flex items-center gap-3 w-full">
        
        {/* App Logo - Made significantly larger to take up ~1/3 of the visual block */}
        <div className="w-[70px] h-[70px] rounded-xl overflow-hidden shrink-0 shadow-sm border border-gray-100">
          <img src="/logo.jpeg" alt="Ahmad Mart" className="w-full h-full object-cover" />
        </div>
        
        {/* App Info */}
        <div className="flex flex-col justify-center flex-1 min-w-0">
          <h3 className="text-[15px] font-extrabold text-gray-900 leading-tight truncate">
            Ahmad Mart
          </h3>
          
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[12px] font-bold text-gray-700">4.9</span>
            <Star className="w-3.5 h-3.5 fill-[#ffc107] text-[#ffc107]" />
          </div>
          
          <p className="text-[11px] font-medium text-gray-500 leading-tight mt-1 truncate">
            10 Minutes Delivery
          </p>
        </div>

        {/* Use App Button */}
        <button className="bg-[#2e7d32] text-white text-[13px] font-bold px-5 py-2.5 rounded-full shadow-sm hover:bg-green-800 transition-colors active:scale-95 shrink-0">
          Use App
        </button>
        
      </div>
    </div>
  );
};
