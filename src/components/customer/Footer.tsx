import React from 'react';
import { Link } from 'react-router-dom';
import { Instagram, MapPin, Mail, Phone } from 'lucide-react';
import googlePlayBadge from '@/assets/google-play-badge.png';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-white border-t border-gray-100 pt-12 pb-24 md:pb-8 mt-auto w-full z-0 relative">
      <div className="container mx-auto px-4 md:px-8 max-w-7xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          
          {/* 1. Brand & App Column */}
          <div className="space-y-6">
            <img src="/logo-round.png" alt="Ahmad Mart" className="h-12 w-12 rounded-full object-cover shadow-sm" />
            <p className="text-gray-500 text-[15px] leading-relaxed max-w-sm">
              Your on-demand delivery partner. From fresh produce to daily essentials, we deliver everything you need right to your doorsteps.
            </p>
            <div className="space-y-3">
              <h4 className="font-bold text-gray-900 text-sm">Download App</h4>
              <div className="flex flex-wrap gap-3">
                <img src={googlePlayBadge} alt="Get it on Google Play" className="h-10 object-contain" />
              </div>
            </div>
          </div>

          {/* 2. Legal & Company Links */}
          <div>
            <h3 className="font-bold text-gray-900 mb-6 text-[16px]">Company & Legal</h3>
            <ul className="space-y-3 text-[14px] text-gray-500 font-medium">
              <li><Link to="/about" className="hover:text-foreground transition-colors">About Us</Link></li>
              <li><Link to="/terms" className="hover:text-foreground transition-colors">Terms & Conditions</Link></li>
              <li><Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link></li>
              <li><Link to="/refund-policy" className="hover:text-foreground transition-colors">Refund Policy</Link></li>
              <li><Link to="/merchant-policy" className="hover:text-foreground transition-colors">Merchant Policy</Link></li>
            </ul>
          </div>

          {/* 3. Contact Us */}
          <div>
            <h3 className="font-bold text-gray-900 mb-6 text-[16px]">Contact Us</h3>
            <ul className="space-y-4 text-[14px] text-gray-500 font-medium">
              <li className="flex items-start">
                <MapPin className="w-5 h-5 text-foreground mr-3 mt-0.5 shrink-0" />
                <span>Ambur, Tamil Nadu, India</span>
              </li>
              <li className="flex items-center">
                <Phone className="w-5 h-5 text-foreground mr-3 shrink-0" />
                <a href="tel:9894144233" className="hover:text-foreground">98941 44233</a>
              </li>
              <li className="flex items-center">
                <Mail className="w-5 h-5 text-foreground mr-3 shrink-0" />
                <a href="mailto:support@ahmadenterprises.in" className="hover:text-foreground break-all">
                  support@ahmadenterprises.in
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="border-t border-gray-100 pt-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-[13px] text-gray-400 font-medium text-center md:text-left">
            © {new Date().getFullYear()} Ahmad Enterprises. All rights reserved.
          </p>
          <div className="flex gap-3">
             <a href="https://www.instagram.com/ahmad_mart_2026?igsh=anA2cHpkcThtbWo3" target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-foreground hover:text-white transition-all"><Instagram className="w-4 h-4" /></a>
          </div>
        </div>
        
        {/* Mandatory Legal Disclaimer */}
        <div className="mt-6 pt-6 border-t border-gray-50 text-[11px] text-gray-400 leading-relaxed text-center md:text-justify bg-gray-50 p-4 rounded-lg">
          <p className="mb-2">
            <strong>Disclaimer:</strong> "Ahmad Mart" is a trade mark of "Ahmad Enterprises". 
            Ahmad Mart is an e-Commerce service that delivers from restaurants, retail, and wholesale stores.
          </p>
          <p>
            By using this application, you acknowledge that Ahmad Mart is responsible only for ordering and delivery services. 
            <strong> Liability Clause:</strong> If any harm is caused to the customer after consuming food or products, the respective Restaurant/Retail/Wholesale Store 
            will be responsible for the same, not Ahmad Mart. Cancellations are generally not entertained after order placement with the store.
          </p>
        </div>
      </div>
    </footer>
  );
};
