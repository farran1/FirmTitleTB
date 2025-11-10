// src/pages/SMSOptIn.tsx
import React from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SMSOptIn from "@/components/SMSOptIn";
import { MessageSquare, Shield, HelpCircle, XCircle } from "lucide-react";

const SMSOptInPage: React.FC = () => {
  const handleSMSSubmit = async (phoneNumber: string) => {
    // This would typically send to your backend/API
    // For now, we'll just log it
    console.log("SMS Opt-in submitted:", phoneNumber);
    
    // In a real implementation, you would:
    // 1. Send phone number to your backend
    // 2. Backend would send opt-in request to SMS provider (e.g., Twilio, Grasshopper)
    // 3. SMS provider would send confirmation message with all required DCA2 elements
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <div className="flex-grow pt-20 bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          <div className="text-center mb-8">
            <MessageSquare className="h-12 w-12 text-[#0057FF] mx-auto mb-4" />
            <h1 className="text-3xl md:text-4xl font-bold mb-4 text-slate-700">
              Stay Connected via SMS
            </h1>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Receive important updates, transaction notifications, and timely information directly to your mobile device.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-white/80 rounded-lg shadow-md p-6">
              <Shield className="h-8 w-8 text-green-600 mb-3" />
              <h3 className="text-xl font-semibold mb-2 text-slate-700">Secure & Private</h3>
              <p className="text-slate-600 text-sm">
                Your phone number is kept confidential and used only for the purposes you consent to.
              </p>
            </div>

            <div className="bg-white/80 rounded-lg shadow-md p-6">
              <XCircle className="h-8 w-8 text-blue-600 mb-3" />
              <h3 className="text-xl font-semibold mb-2 text-slate-700">Easy Opt-Out</h3>
              <p className="text-slate-600 text-sm">
                Reply <strong>STOP</strong> to any message at any time to unsubscribe instantly.
              </p>
            </div>
          </div>

          <SMSOptIn onSubmit={handleSMSSubmit} />

          {/* Help Section */}
          <div className="mt-8 bg-blue-50 rounded-lg shadow-md p-6 border border-blue-200">
            <div className="flex items-start gap-3">
              <HelpCircle className="h-6 w-6 text-blue-600 mt-1 flex-shrink-0" />
              <div>
                <h3 className="text-lg font-semibold mb-2 text-slate-700">Need Help?</h3>
                <p className="text-sm text-slate-600 mb-3">
                  If you need assistance with our SMS service:
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm text-slate-700 ml-2">
                  <li>Reply <strong>HELP</strong> to any message for support information</li>
                  <li>Reply <strong>STOP</strong> to opt-out at any time</li>
                  <li>Contact us at <a href="tel:813-812-4949" className="text-blue-600 hover:underline">813-812-4949</a> or <a href="mailto:scott@firmtitletb.com" className="text-blue-600 hover:underline">scott@firmtitletb.com</a></li>
                </ul>
              </div>
            </div>
          </div>

          {/* Additional Compliance Information */}
          <div className="mt-6 text-center">
            <p className="text-xs text-slate-500">
              By subscribing, you agree to receive SMS messages from Firm Title TB. 
              Message frequency: Up to 4 messages per month. 
              Message and data rates may apply. 
              <Link to="/privacy" className="text-blue-600 hover:underline ml-1">
                View our Privacy Policy
              </Link>
              .
            </p>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default SMSOptInPage;

