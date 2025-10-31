import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu, Facebook, Instagram, Linkedin, Youtube } from "lucide-react";
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
        <div className="mx-auto px-4">
          <div className="flex items-center justify-between">
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <div className="flex items-center md:hidden">
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 md:hidden">
                    <Menu className="h-5 w-5 md:h-6 md:w-6" />
                  </Button>
                </SheetTrigger>
                <Link to="/" className="ml-2 text-white font-bold text-lg md:hidden">Firm Title TB</Link>
              </div>
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
                    to="/videos" 
                    className={`px-8 py-4 hover:bg-slate-700/70 transition-colors ${isActive("/videos") ? "bg-slate-700/70 font-medium" : ""}`}
                    onClick={() => setIsOpen(false)}
                  >
                    Videos
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
                to="/videos"
                className={`text-white hover:text-white/80 transition-colors font-medium ${isActive("/videos") ? "underline underline-offset-4" : ""}`}
              >
                Videos
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
              <a href="https://www.facebook.com/firmtitletampabay/" target="_blank" rel="noopener noreferrer" className="text-white hover:text-white/80 transition-colors">
                <Facebook className="h-5 w-5 md:h-6 md:w-6" />
              </a>
              <a href="https://www.instagram.com/firmtitletb/" target="_blank" rel="noopener noreferrer" className="text-white hover:text-white/80 transition-colors">
                <Instagram className="h-5 w-5 md:h-6 md:w-6" />
              </a>
              <a href="https://www.youtube.com/@FirmTitleTB" target="_blank" rel="noopener noreferrer" className="text-white hover:text-white/80 transition-colors">
                <Youtube className="h-5 w-5 md:h-6 md:w-6" />
              </a>
              <a href="https://www.tiktok.com/@firmtitletb" target="_blank" rel="noopener noreferrer" className="text-white hover:text-white/80 transition-colors">
                <svg className="h-5 w-5 md:h-6 md:w-6" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                </svg>
              </a>
              <a href="https://www.linkedin.com/in/scott-farrell-0778266/" target="_blank" rel="noopener noreferrer" className="text-white hover:text-white/80 transition-colors">
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
