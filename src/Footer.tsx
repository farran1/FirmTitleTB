
import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="bg-slate-600/70 text-white py-4 md:py-6">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center md:text-left">
            <h3 className="text-lg font-bold mb-2">Quick Links</h3>
            <ul className="space-y-1">
              <li><Link to="/" className="hover:underline">Home</Link></li>
              <li><Link to="/about" className="hover:underline">About</Link></li>
              <li><Link to="/contact" className="hover:underline">Contact</Link></li>
              <li><Link to="/calculators" className="hover:underline">Calculators</Link></li>
              <li><Link to="/privacy" className="hover:underline">Privacy Policy</Link></li>
            </ul>
          </div>
          
          <div className="text-center">
            <h3 className="text-lg font-bold mb-2">Contact</h3>
            <p>1234 Main Street, Suite 100</p>
            <p>Tampa Bay, FL 33606</p>
            <p>(123) 456-7890</p>
          </div>
          
          <div className="text-center md:text-right">
            <h3 className="text-lg font-bold mb-2">Office Hours</h3>
            <p>Monday - Friday: 9:00 AM - 5:00 PM</p>
            <p>Saturday - Sunday: Closed</p>
          </div>
        </div>
        
        <div className="border-t border-white/20 mt-4 pt-4 text-center space-y-2">
          <p className="text-sm md:text-base text-gray-200">© 2025 FirmTitleTB. All rights reserved.</p>
          <div className="flex flex-wrap justify-center items-center gap-2 text-xs text-gray-300">
            <Link to="/privacy" className="hover:underline hover:text-white transition-colors">Privacy Policy</Link>
            <span className="text-gray-500">|</span>
            <Link to="/sms-opt-in" className="hover:underline hover:text-white transition-colors">SMS Opt-In</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
