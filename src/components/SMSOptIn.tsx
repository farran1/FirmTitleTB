// src/components/SMSOptIn.tsx
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, CheckCircle2, AlertCircle } from "lucide-react";

interface SMSOptInProps {
  onSubmit?: (phoneNumber: string) => void;
  showTitle?: boolean;
}

const SMSOptIn: React.FC<SMSOptInProps> = ({ onSubmit, showTitle = true }) => {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const formatPhoneNumber = (value: string) => {
    const cleaned = value.replace(/\D/g, "");
    if (cleaned.length <= 3) return cleaned;
    if (cleaned.length <= 6) return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhoneNumber(formatted);
  };

  const validatePhoneNumber = (phone: string): boolean => {
    const cleaned = phone.replace(/\D/g, "");
    return cleaned.length === 10;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("idle");
    setErrorMessage("");

    if (!phoneNumber) {
      setErrorMessage("Please enter your phone number");
      setStatus("error");
      return;
    }

    if (!validatePhoneNumber(phoneNumber)) {
      setErrorMessage("Please enter a valid 10-digit phone number");
      setStatus("error");
      return;
    }

    if (!consent) {
      setErrorMessage("You must consent to receive SMS messages to continue");
      setStatus("error");
      return;
    }

    try {
      // Call the onSubmit callback if provided
      if (onSubmit) {
        await onSubmit(phoneNumber);
      }

      // Here you would typically send the phone number to your backend/API
      // For now, we'll simulate a successful submission
      setStatus("success");
      setPhoneNumber("");
      setConsent(false);
    } catch (error) {
      setErrorMessage("An error occurred. Please try again later.");
      setStatus("error");
    }
  };

  return (
    <div className="bg-white/80 rounded-lg shadow-md p-6">
      {showTitle && (
        <h2 className="text-2xl font-semibold mb-4 text-slate-700">
          Sign Up for SMS Updates
        </h2>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="phone">Mobile Phone Number</Label>
          <Input
            id="phone"
            type="tel"
            placeholder="(555) 123-4567"
            value={phoneNumber}
            onChange={handlePhoneChange}
            maxLength={14}
            className="w-full"
            required
          />
          <p className="text-xs text-slate-600">
            Enter your 10-digit mobile phone number
          </p>
        </div>

        {/* DCA2 Required Disclosures */}
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
          <div className="flex items-start gap-2">
            <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-slate-700">
              <p className="font-semibold mb-2">By opting in, you agree to receive SMS messages from <strong>Firm Title TB</strong>.</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>Message Frequency:</strong> You may receive up to 4 messages per month.</li>
                <li><strong>Message and Data Rates:</strong> Standard message and data rates may apply.</li>
                <li><strong>Opt-out:</strong> Reply <strong>STOP</strong> to any message to opt-out at any time.</li>
                <li><strong>Help:</strong> Reply <strong>HELP</strong> to any message for assistance.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Privacy Policy Link */}
        <div className="text-sm text-slate-600">
          <p>
            By providing your phone number, you agree to our{" "}
            <Link to="/privacy" className="text-blue-600 hover:underline font-medium">
              Privacy Policy
            </Link>
            {" "}and{" "}
            <Link to="/privacy#sms" className="text-blue-600 hover:underline font-medium">
              SMS Terms
            </Link>
            .
          </p>
        </div>

        {/* Consent Checkbox */}
        <div className="flex items-start space-x-2">
          <Checkbox
            id="consent"
            checked={consent}
            onCheckedChange={(checked) => setConsent(checked as boolean)}
            className="mt-1"
            required
          />
          <Label htmlFor="consent" className="text-sm text-slate-700 cursor-pointer">
            I consent to receive SMS messages from Firm Title TB. I understand that I can opt-out at any time by replying STOP, and that message and data rates may apply.
          </Label>
        </div>

        {/* Status Messages */}
        {status === "error" && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        {status === "success" && (
          <Alert className="bg-green-50 border-green-200">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              Successfully opted in! You will receive a confirmation message shortly.
            </AlertDescription>
          </Alert>
        )}

        <Button
          type="submit"
          className="w-full bg-[#0057FF] hover:bg-[#0046cc] text-white"
        >
          Subscribe to SMS Updates
        </Button>
      </form>

      {/* Additional DCA2 Compliance Information */}
      <div className="mt-4 pt-4 border-t border-slate-200">
        <p className="text-xs text-slate-600">
          <strong>Program Details:</strong> Firm Title TB SMS service. Message frequency varies. 
          For help, reply HELP. To opt-out, reply STOP. 
          Standard message and data rates may apply. 
          Carriers are not liable for delayed or undelivered messages.
        </p>
      </div>
    </div>
  );
};

export default SMSOptIn;

