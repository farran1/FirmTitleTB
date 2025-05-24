
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Mail, Phone, MapPin, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const Contact = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex-grow pt-20">
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-6 text-slate-700">Contact Us</h1>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white/80 rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-semibold mb-4 text-slate-700">Get In Touch</h2>
              
              <form className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Your Name</Label>
                  <Input id="name" placeholder="Enter your name" />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input id="email" type="email" placeholder="Enter your email" />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="message">Message</Label>
                  <textarea
                    id="message"
                    className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="How can we help you?"
                  />
                </div>
                
                <Button type="submit" className="w-full bg-slate-600/70 hover:bg-slate-700/70">
                  Send Message
                </Button>
              </form>
            </div>
            
            <div className="bg-white/80 rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-semibold mb-4 text-slate-700">Contact Information</h2>
              
              <div className="space-y-4">
                <div className="flex items-start">
                  <Phone className="h-5 w-5 mr-3 text-slate-600/70" />
                  <div>
                    <p className="font-medium text-slate-700">Phone</p>
                    <p className="text-slate-600">(123) 456-7890</p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <Mail className="h-5 w-5 mr-3 text-slate-600/70" />
                  <div>
                    <p className="font-medium text-slate-700">Email</p>
                    <p className="text-slate-600">info@firmtitletb.com</p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <MapPin className="h-5 w-5 mr-3 text-slate-600/70" />
                  <div>
                    <p className="font-medium text-slate-700">Office</p>
                    <p className="text-slate-600">1234 Main Street, Suite 100</p>
                    <p className="text-slate-600">Tampa Bay, FL 33606</p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <Clock className="h-5 w-5 mr-3 text-slate-600/70" />
                  <div>
                    <p className="font-medium text-slate-700">Business Hours</p>
                    <p className="text-slate-600">Monday - Friday: 9:00 AM - 5:00 PM</p>
                    <p className="text-slate-600">Saturday - Sunday: Closed</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Contact;
