import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="bg-slate-600/90 text-white py-6">
      <div className="mx-auto px-4 text-center">
        <p className="text-sm md:text-base text-gray-200 mb-2">© 2025 FirmTitleTB. All rights reserved.</p>
        <div className="flex flex-wrap justify-center items-center gap-2 text-xs text-gray-300">
          <Link to="/privacy" className="hover:underline hover:text-white transition-colors">Privacy Policy</Link>
          <span className="text-gray-500">|</span>
          <Link to="/sms-opt-in" className="hover:underline hover:text-white transition-colors">SMS Opt-In</Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
