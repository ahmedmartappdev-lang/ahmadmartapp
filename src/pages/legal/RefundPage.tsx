import React from "react";
import CustomerLayout from "@/components/layouts/CustomerLayout";

const RefundPage = () => {
  return (
    <CustomerLayout>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-3xl font-bold mb-6 text-primary">Cancellation & Refund Policy</h1>
        
        <div className="prose prose-blue max-w-none space-y-6 text-gray-700">
          
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Order Cancellation</h2>
            <p>
              <strong>SORRY… we generally DO NOT entertain any Order Cancellations.</strong>
            </p>
            <p>
              Once the order is placed with the Restaurant, Retail, or Wholesale Store, they generally 
              do not entertain cancellation of orders. However, if you request an Order Cancellation 
              <strong> prior to the order being confirmed</strong>, the cancellation is up to the 
              discretion of Ahmad Mart.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Refunds for Bad/Late Deliveries</h2>
            <p>
              Ahmad Mart adheres to a very high standard of Quality of Services and strives for high 
              Customer Satisfaction.
            </p>
            <p className="mt-2">
              In case of an order being <strong>LATE, BAD, or INCORRECT</strong> owing to a process-related 
              issue of Ahmad Mart, we generally <strong>DO NOT charge the customer for the order</strong>. 
              However, this decision is totally up to the discretion of Ahmad Mart.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Delivery Rights</h2>
            <p>
              Ahmad Mart will try to deliver the order via our delivery personnel as per the order submitted 
              by the user, but we reserve the full right to deliver a similar or alternate order for 
              reasons beyond our control. Such action shall not be deemed as bad delivery.
            </p>
            <p className="mt-2">
              The user <strong>does not have the right to refuse the order</strong> at the time of receipt 
              of the ordered items and shall duly make the payment.
            </p>
          </section>

        </div>
      </div>
    </CustomerLayout>
  );
};

export default RefundPage;
