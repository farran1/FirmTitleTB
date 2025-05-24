
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu, Facebook, Instagram, Linkedin } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const isMobile = useIsMobile();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      {/* Single slate gray navbar with navigation and social icons */}
      <div className="bg-slate-600/70 py-4">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between">
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 md:hidden">
                  <Menu className="h-5 w-5 md:h-6 md:w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="bg-slate-600/70 text-white w-[250px] p-0">
                <nav className="flex flex-col space-y-1">
                  <Link 
                    to="/" 
                    className={`px-8 py-4 hover:bg-slate-700/70 transition-colors ${isActive("/") ? "bg-slate-700/70 font-medium" : ""}`}
                    onClick={() => setIsOpen(false)}
                  >
                    Home
                  </Link>
                  <Link 
                    to="/about" 
                    className={`px-8 py-4 hover:bg-slate-700/70 transition-colors ${isActive("/about") ? "bg-slate-700/70 font-medium" : ""}`}
                    onClick={() => setIsOpen(false)}
                  >
                    About
                  </Link>
                  <Link 
                    to="/contact" 
                    className={`px-8 py-4 hover:bg-slate-700/70 transition-colors ${isActive("/contact") ? "bg-slate-700/70 font-medium" : ""}`}
                    onClick={() => setIsOpen(false)}
                  >
                    Contact
                  </Link>
                  <Link 
                    to="/calculators" 
                    className={`px-8 py-4 hover:bg-slate-700/70 transition-colors ${isActive("/calculators") ? "bg-slate-700/70 font-medium" : ""}`}
                    onClick={() => setIsOpen(false)}
                  >
                    Calculators
                  </Link>
                </nav>
              </SheetContent>
            </Sheet>
            
            {/* Desktop menu */}
            <nav className="hidden md:flex space-x-8">
              <Link 
                to="/"
                className={`text-white hover:text-white/80 transition-colors font-medium ${isActive("/") ? "underline underline-offset-4" : ""}`}
              >
                Home
              </Link>
              <Link 
                to="/about"
                className={`text-white hover:text-white/80 transition-colors font-medium ${isActive("/about") ? "underline underline-offset-4" : ""}`}
              >
                About
              </Link>
              <Link 
                to="/contact"
                className={`text-white hover:text-white/80 transition-colors font-medium ${isActive("/contact") ? "underline underline-offset-4" : ""}`}
              >
                Contact
              </Link>
              <Link 
                to="/calculators"
                className={`text-white hover:text-white/80 transition-colors font-medium ${isActive("/calculators") ? "underline underline-offset-4" : ""}`}
              >
                Calculators
              </Link>
            </nav>

            {/* Social icons - always visible */}
            <div className="flex space-x-3 md:space-x-6">
              <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="text-white hover:text-white/80 transition-colors">
                <Facebook className="h-5 w-5 md:h-6 md:w-6" />
              </a>
              <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="text-white hover:text-white/80 transition-colors">
                <Instagram className="h-5 w-5 md:h-6 md:w-6" />
              </a>
              <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="text-white hover:text-white/80 transition-colors">
                <Linkedin className="h-5 w-5 md:h-6 md:w-6" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Navbar;
