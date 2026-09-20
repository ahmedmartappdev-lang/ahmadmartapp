import React from "react";
import { CustomerLayout } from "@/components/layouts/CustomerLayout";

/**
 * Public account-deletion request page. URL is submitted to the Google
 * Play Console as the "data deletion request" link, so it must remain
 * reachable without authentication.
 */
const AccountDeletionPage: React.FC = () => {
  const supportEmail = "support@ahmadenterprises.in";
  const subject = encodeURIComponent("Account Deletion Request");
  const mailtoHref = `mailto:${supportEmail}?subject=${subject}`;

  return (
    <CustomerLayout>
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <h1 className="text-3xl font-bold mb-2 text-primary">
          Request Account Deletion
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          Ahmad Mart — data deletion policy
        </p>

        <div className="prose prose-blue max-w-none space-y-6 text-gray-700">
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">How to request</h2>
            <p>
              Email{" "}
              <a
                href={mailtoHref}
                className="text-primary font-semibold underline"
              >
                {supportEmail}
              </a>{" "}
              with the subject{" "}
              <span className="font-semibold">"Account Deletion Request"</span>{" "}
              and include your registered phone number in the message.
            </p>
            <p>
              You can also tap{" "}
              <span className="font-semibold">Profile → Delete My Account</span>{" "}
              inside the app — it will open a pre-filled email automatically.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">What happens next</h2>
            <ol className="list-decimal pl-5 space-y-2">
              <li>We verify your identity using the registered phone number.</li>
              <li>We check for any outstanding dues or active orders.</li>
              <li>
                We process the deletion within{" "}
                <span className="font-semibold">30 days</span> of a verified
                request.
              </li>
              <li>
                We email you a confirmation with a unique reference number
                (e.g. <span className="font-mono">DEL-001</span>) once the
                deletion is complete.
              </li>
            </ol>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">What gets deleted</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Your name, email and phone number</li>
              <li>Your saved delivery addresses</li>
              <li>Your profile, preferences and notification settings</li>
              <li>Your authentication account (you will no longer be able to sign in)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">What is retained</h2>
            <p>
              Transaction records (orders, payments, invoices, credit/BNPL
              ledgers) are retained for{" "}
              <span className="font-semibold">7 years</span> as required by
              Indian GST and accounting laws. After your account is deleted,
              these records are{" "}
              <span className="font-semibold">anonymised</span> — your personal
              identifiers are stripped, and the records can no longer be linked
              back to you.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">When deletion is not possible</h2>
            <p>
              Accounts with{" "}
              <span className="font-semibold">outstanding BNPL (credit) balances</span>{" "}
              or <span className="font-semibold">active orders</span> cannot be
              deleted until those are fully settled or completed. Please clear
              your dues and ensure no order is in progress before requesting
              deletion.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Questions?</h2>
            <p>
              Write to us at{" "}
              <a
                href={`mailto:${supportEmail}`}
                className="text-primary font-semibold underline"
              >
                {supportEmail}
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </CustomerLayout>
  );
};

export default AccountDeletionPage;
