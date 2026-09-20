import React from "react";
import CustomerLayout from "@/components/layouts/CustomerLayout";

const MerchantPolicyPage = () => {
  return (
    <CustomerLayout>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-3xl font-bold mb-6 text-primary">Merchant Policy</h1>
        
        <div className="prose prose-blue max-w-none space-y-6 text-gray-700">
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Overview</h2>
            <p>
              Ahmad Mart is an e-Commerce service delivering from over 200 restaurants, retail, and wholesale 
              stores in India. We partner with local businesses to help them conveniently deliver their 
              goods and grow their business.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Registration & Documents</h2>
            <p>To register with Ahmad Mart, businesses must provide the necessary documentation. Please contact support for the specific list of required documents.</p>
          </section>

          <section className="bg-blue-50 p-6 rounded-lg border border-blue-100">
            <h2 className="text-xl font-bold text-blue-900 mb-3">Commission & Charges</h2>
            <p className="font-medium">
              Ahmad Mart charges a commission along with a charge of <strong>2% of the payment gateways</strong>.
            </p>
            <p className="mt-2 text-sm">
              Note: Any discount that the restaurant/store wants to give is sponsored by the 
              restaurant/retail/wholesale store themselves. If stores wish to promote their stores 
              specifically on our app, additional charges will apply as per the Ahmad Mart Advertising Model.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Agreement & Liability (MOU)</h2>
            <p>
              After registration, the food business operator and Ahmad Mart sign a <strong>Memorandum of Understanding (MOU)</strong>.
            </p>
            <div className="bg-red-50 p-4 rounded border-l-4 border-red-500 mt-3">
              <p className="text-red-800 font-medium">
                <strong>Important Liability Clause:</strong> The agreement states that Ahmad Mart website/Application 
                only covers food ordering and delivering. If any harm is caused to the customer after consuming 
                the food, the <strong>Restaurants, Retail, and Wholesale Store will be responsible for the same, not Ahmad Mart.</strong>
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Contact for Registration</h2>
            <p>
              If you have any query regarding registrations or need an FSSAI license, please contact us:
              <br />
              <strong>Email:</strong> info@ahmadenterprises.in
              <br />
              <strong>Phone:</strong> 98941 44233
            </p>
          </section>
        </div>
      </div>
    </CustomerLayout>
  );
};

export default MerchantPolicyPage;
