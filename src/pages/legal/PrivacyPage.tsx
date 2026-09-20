import React from "react";
import CustomerLayout from "@/components/layouts/CustomerLayout";
import { Link } from "react-router-dom";

/**
 * Play-Store-grade privacy policy. Google Play requires a publicly reachable
 * policy that names the app, lists every data type collected, explains use,
 * sharing, retention and deletion, and gives a contact. The Data Safety form
 * answers must match what this page says — update both together.
 */
const PrivacyPage = () => {
  return (
    <CustomerLayout>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-3xl font-bold mb-2 text-primary">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-6">Last updated: 6 September 2026</p>

        <div className="prose prose-blue max-w-none space-y-6 text-gray-700">
          <p>
            This Privacy Policy applies to the <strong>Ahmad Mart</strong> mobile application
            (available on Google Play) and the website <strong>www.ahmadmart.in</strong>, operated
            by Ahmad Mart Hyperlocal Services, Ambur, Tamil Nadu, India ("Ahmad Mart", "we",
            "us"). It explains what information we collect, why we collect it, how it is used and
            shared, and the choices you have.
          </p>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Information We Collect</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Account information.</strong> Your name, mobile phone number (used for
                OTP login), and — if you sign in with Google — the name and email address of your
                Google account. We never see your Google password.
              </li>
              <li>
                <strong>Delivery addresses and location.</strong> The addresses you save, and —
                only when you tap a location button and grant permission — your device's precise
                location, used to place the map pin, auto-fill your address, and check whether
                your area is serviceable. We do not track your location in the background.
              </li>
              <li>
                <strong>Order and transaction details.</strong> The items you order, order
                amounts, chosen payment method, delivery status, and (for Ahmad Credit users)
                your credit limit, balance, and repayment history. We do not collect card
                numbers or banking passwords in the app.
              </li>
              <li>
                <strong>Photos and documents you upload.</strong> Vendors upload product and
                store photos. Delivery partners upload onboarding documents (such as ID,
                driving licence, and bank details) which are used solely for verification and
                payouts. Uploads use your device's standard file picker; the app does not read
                your photo library.
              </li>
              <li>
                <strong>Support and communication data.</strong> Messages or requests you send
                us, and notification preferences you choose.
              </li>
              <li>
                <strong>Technical data.</strong> Basic device and log information needed to run
                the service securely (such as app version and error logs). We do not use
                advertising trackers and we do not sell data.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">App Permissions</h2>
            <p>The Android app may request the following permissions, always with a system prompt and only when the related feature is used:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Location</strong> — to detect your current position when adding a delivery address. Optional; you can always type or pick your address on the map instead.</li>
              <li><strong>Camera</strong> — only if you choose to capture a photo directly when uploading an image (for example a product photo). Optional; choosing from files needs no permission.</li>
              <li><strong>Notifications</strong> — to send order status updates you opt in to. Optional.</li>
            </ul>
            <p>You can withdraw any permission at any time in your device's Settings.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">How We Use Information</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>To create and secure your account and sign you in.</li>
              <li>To process, deliver, and support your orders, including sharing what is necessary with the store and delivery partner fulfilling them.</li>
              <li>To operate Ahmad Credit for customers who opt in.</li>
              <li>To send order status notifications you have enabled.</li>
              <li>To prevent fraud and misuse, resolve disputes, and comply with law.</li>
              <li>To improve the reliability of the service (diagnostics and error logs).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">How Information Is Shared</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>With stores and delivery partners</strong> — the assigned store and
                delivery partner see the details needed to fulfil your order: your name,
                delivery address, phone number, and order contents.
              </li>
              <li>
                <strong>With service providers</strong> — we host data and run the service on
                trusted infrastructure providers: Supabase (database, authentication, storage),
                Vercel (website hosting), and Google (sign-in, and Google Maps for address
                selection). These providers process data on our behalf and are bound by their
                own security and privacy commitments.
              </li>
              <li>
                <strong>Legal requirements</strong> — if required by applicable law or valid
                legal process.
              </li>
            </ul>
            <p className="font-semibold">We do not sell your personal information, and we do not share it with advertisers.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Data Retention &amp; Deleting Your Account</h2>
            <p>
              We keep your information while your account is active. Order and billing records
              may be retained for the period required by Indian tax and commercial law even
              after account closure.
            </p>
            <p>
              You can request deletion of your account and associated personal data at any time
              from the app (Profile → Delete Account) or via our{" "}
              <Link to="/account-deletion" className="text-blue-600 underline">account deletion page</Link>.
              Once processed, your personal data is removed or irreversibly anonymised except
              where retention is legally required.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Security</h2>
            <p>
              All traffic between the app and our servers is encrypted with HTTPS/TLS. Data is
              stored with role-based access controls so that customers, stores, delivery
              partners, and administrators can each access only what their role requires.
              Delivery partner documents are accessible only to administrators for
              verification. No method of transmission or storage is 100% secure, but we work to
              protect your information using industry-standard measures.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Children</h2>
            <p>
              Ahmad Mart is a shopping service intended for users aged 18 and above. We do not
              knowingly collect personal information from children. If you believe a child has
              provided us personal information, contact us and we will delete it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Your Rights</h2>
            <p>
              You may access and correct your profile information in the app at any time, and
              you may request a copy or deletion of your personal data by contacting us. We
              respond to verified requests within a reasonable time and as required by
              applicable Indian law, including the Digital Personal Data Protection Act, 2023.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Changes to This Policy</h2>
            <p>
              We may update this policy from time to time. Material changes will be posted on
              this page with an updated "Last updated" date. Continued use of the service after
              changes take effect constitutes acceptance of the revised policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Contact &amp; Grievances</h2>
            <p>
              For privacy questions, data requests, or grievances, contact:
            </p>
            <p>
              Ahmad Mart Hyperlocal Services, Ambur, Tamil Nadu, India<br />
              Email: <a href="mailto:support@ahmadenterprises.in" className="text-blue-600">support@ahmadenterprises.in</a>
            </p>
          </section>
        </div>
      </div>
    </CustomerLayout>
  );
};

export default PrivacyPage;
