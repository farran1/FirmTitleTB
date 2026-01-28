// src/pages/PrivacyPolicy.tsx
import React from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const PrivacyPolicy: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <div className="flex-grow pt-20">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <h1 className="text-3xl md:text-4xl font-bold mb-6 text-slate-700">
            Privacy Policy
          </h1>

          <div className="bg-white/80 rounded-lg shadow-md p-6 md:p-8 space-y-6 text-slate-700">
            <p className="text-sm text-slate-600">
              <strong>Effective Date:</strong> January 01, 2025<br />
              <strong>Last Updated:</strong> January 27, 2026
            </p>

            <p>
              Firm Title TB, LLC ("we," "our," or "us") values your privacy and is committed to protecting your personal information. This Privacy Policy explains how we collect, use, and protect your information when you interact with us, including via our website, email, and SMS/text messaging services.
            </p>

            <section>
              <h2 className="text-2xl font-semibold mb-3">1. Information We Collect</h2>
              <p className="mb-2">We may collect the following types of personal information when you interact with us:</p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li><strong>Contact Information:</strong> Name, email address, phone number, and mailing address.</li>
                <li><strong>Transaction Information:</strong> Details related to services we provide to you.</li>
                <li><strong>Technical Information:</strong> Data collected from website usage, such as cookies or IP addresses.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">2. How We Use Your Information</h2>
              <p className="mb-2">We use your information to:</p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Respond to your inquiries and provide the services you request.</li>
                <li>Communicate updates or necessary information about your ongoing transactions.</li>
                <li>Send SMS/text messages, with your consent, for communication-related to your inquiries or services.</li>
              </ul>
            </section>

            <section id="sms">
              <h2 className="text-2xl font-semibold mb-3">3. SMS Messaging Terms</h2>
              <p className="mb-3">
                By providing your mobile number and opting in, you consent to receive SMS/text messages from Firm Title TB, LLC. Consent to receive SMS/text messages is not a condition of purchasing any goods or services.
                Mobile opt-in information is never shared with third parties for any purpose.
                These messages are limited to:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-4 mb-3">
                <li>Responding to inquiries.</li>
                <li>Providing updates or information about your active requests.</li>
                <li>Important service notifications.</li>
              </ul>
              
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-3">
                <p className="mb-2"><strong>Message Frequency:</strong> Message frequency varies and may include a range of content, depending on your request. You may receive up to 4 messages per month.</p>
                <p className="mb-2"><strong>Message and Data Rates:</strong> Standard message and data rates may apply. Carriers are not liable for delayed or undelivered messages.</p>
              </div>

              <div className="mb-3">
                <p className="mb-2"><strong>Opting Out:</strong> You can opt-out of SMS text messages at any time by:</p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Replying <strong>"STOP"</strong> to any text message you receive from us.</li>
                  <li>Replying <strong>"HELP"</strong> to any text message for assistance.</li>
                  <li>Contacting us directly through our office.</li>
                </ul>
              </div>

              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <p className="mb-2"><strong>HELP Instructions:</strong> For help with our SMS text service, reply <strong>"HELP"</strong> to any message. A response containing the Firm Title TB, LLC brand name, program details,
                message frequency, and support contact information. You will also receive information about how to opt-out (reply STOP).</p>

              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">4. Sharing of Information</h2>
              <p className="mb-2">We do not sell, trade, or share your personal information with third parties, except as necessary to:</p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Comply with legal obligations.</li>
                <li>Provide services through trusted third-party vendors (e.g., payment processors or service providers).</li>
              </ul>
              <p className="mt-2">
                When we share information with service providers, we require them to protect your information through written agreements and compliance with our privacy standards.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">5. Data Protection and Security</h2>
              <p>
                We implement reasonable security measures to protect your personal information from unauthorized access, alteration, or disclosure. However, no data transmission over the internet can be guaranteed to be completely secure. We encourage you to take precautions to protect your personal information online.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">6. Your Rights</h2>
              <p className="mb-2">You have the right to:</p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Access, update, or correct your personal information.</li>
                <li>Withdraw your consent for SMS/text messages.</li>
                <li>Request deletion of your information, subject to legal retention obligations.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">7. Cookies and Tracking Technologies</h2>
              <p className="mb-2">Our website uses cookies and similar technologies to:</p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Maintain your preferences</li>
                <li>Analyze website traffic and usage</li>
                <li>Improve website functionality</li>
                <li>Provide targeted content</li>
              </ul>
              <p className="mt-2">
                You can manage cookie preferences through your browser settings. Disabling cookies may limit some website features.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">8. Contact Us</h2>
              <p className="mb-2">For questions about this Privacy Policy or to exercise your rights, please contact us at:</p>
              <div className="bg-slate-50 p-4 rounded-lg">
                <p className="font-semibold">Firm Title TB, LLC</p>
                <p>3502 Henderson Blvd., Suite 225</p>
                <p>Tampa, FL 33609</p>
                <p className="mt-2">
                  <strong>Phone:</strong> <a href="tel:813-812-4949" className="text-blue-600 hover:underline">813-812-4949</a>
                </p>
                <p>
                  <strong>Email:</strong> <a href="mailto:scott@firmtitletb.com" className="text-blue-600 hover:underline">scott@firmtitletb.com</a>
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">9. Updates to This Policy</h2>
              <p>
                We may update this Privacy Policy periodically. Any changes will be posted on our website with the updated effective date.
              </p>
            </section>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default PrivacyPolicy;

