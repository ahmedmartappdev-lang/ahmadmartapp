import React from "react";
import CustomerLayout from "@/components/layouts/CustomerLayout";

const AboutPage = () => {
  return (
    <CustomerLayout>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-3xl font-bold mb-6 text-primary">About Us</h1>
        
        <div className="prose prose-lg max-w-none space-y-6 text-gray-700">
          <p>
            We are your on-demand delivery partners with a penchant for providing last-mile delivery 
            of foods and all household essentials right at your doorsteps. <strong>Ahmad Mart</strong> offers 
            you a comprehensive range of necessities to meet your everyday needs. We are here to fix 
            all your delivery woes and we also strive to keep our vendors as well as customers happy.
          </p>

          <p>
            Our beloved customers can always expect a responsible and swift delivery service each time 
            they shop with us. Shop from multiple stores of your choice within the same order. Expect 
            real-time invoices from the shops for all your purchases and there are absolutely no 
            restrictions on minimum purchase quantity or amount.
          </p>

          <p>
            Overseas customers from anywhere across the globe can now send orders to their loved ones 
            in our service area. You need not be anxious while shopping with us as our customers can 
            avail secure payment options with cent per cent payment protection. Feel free to get in 
            touch with our round-the-clock customer care team for all your order and payment related queries.
          </p>

          <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 mt-8">
            <h3 className="text-xl font-semibold mb-2">Contact Us</h3>
            <p className="mb-1">
              <strong>Email:</strong> <a href="mailto:support@ahmadenterprises.in" className="text-blue-600 hover:underline">support@ahmadenterprises.in</a>
            </p>
            <p>
              <strong>Phone:</strong> <a href="tel:9894144233" className="text-blue-600 hover:underline">98941 44233</a>
            </p>
          </div>
        </div>
      </div>
    </CustomerLayout>
  );
};

export default AboutPage;
