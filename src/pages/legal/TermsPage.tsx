import React from "react";
import CustomerLayout from "@/components/layouts/CustomerLayout";

const TermsPage = () => {
  return (
    <CustomerLayout>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-3xl font-bold mb-6 text-primary">Terms & Conditions (Merchant Agreement)</h1>
        
        <div className="prose prose-blue max-w-none space-y-6 text-gray-700">
          <p className="text-sm text-gray-500 italic">
            This Listing Agreement is entered into between the Merchant (Restaurant/Retail and Wholesale Store) and Ahmad Mart (referred to as "US" or "WE").
          </p>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">1. Service Overview</h2>
            <p>
              Ahmad Mart owns a website and Mobile Application with the domain name "Ahmadmart.in/Ahmad Mart", 
              through which consumers of Food, Groceries, House Hold and other items can order such items 
              online for delivery or pick-up from participating Merchants. Customers can view the Merchant's 
              menu or product list ("Menu") and order online, whereby such order is transmitted to the Merchant for fulfillment.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">2. License to Use Logo and Menu</h2>
            <p>
              Merchant agrees to permit Ahmad Mart to list its Menu on the Website/App and to permit Ahmad Mart 
              to use Merchant's logo or other promotional material in such listing, without any fee, license, 
              or other charge payable by Ahmad Mart.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">3. Billing, Payment, and Fees</h2>
            <p>
              Merchant agrees to accept all orders transacted through the website/App run by Ahmad Mart and honor 
              the total price quoted to the customer. Merchants must keep the Menu and Price updated by contacting 
              Ahmad Mart support.
            </p>
            <p className="mt-2">
              We will bill customers directly via the Internet for each order. We will pay the Merchant by 
              Cheque or direct transfer. Non-renewal of terms will not become effective until all fees 
              accrued and owing to Ahmad Mart are paid in full.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">4. Marketing Agreement</h2>
            <p>If requested by Ahmad Mart, the Merchant agrees to:</p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>Prominently display Ahmad Mart promotional or advertising material.</li>
              <li>Insert flyers or cards advertising the Website into bags containing orders.</li>
              <li>Include an Ahmad Mart logo or brief marketing message on its delivery/takeout menus.</li>
              <li>Run <strong>Two Ahmad Mart Special "First Time User" Promotions</strong> (electronic Coupons) for one two-week period per year.</li>
              <li>Run <strong>one Ahmad Mart Special Promotion</strong> for at least one 30-day period per year.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">5. Miscellaneous</h2>
            <p>
              Ahmad Mart may modify the terms of this Agreement with Thirty (30) days' prior written notice to Merchant. 
              If such changes modify fees or terms, Merchant may terminate this Agreement with written notice within 
              that 30-day period, but remains liable for fees due up to the date of termination.
            </p>
          </section>
        </div>
      </div>
    </CustomerLayout>
  );
};

export default TermsPage;
