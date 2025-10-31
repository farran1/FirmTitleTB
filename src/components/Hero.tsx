import { useEffect, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import VideoCircle from "@/components/VideoCircle";
import { navVideos } from "@/data/navVideos";
import { Link } from "react-router-dom";

const images = [
  "https://media.cntraveler.com/photos/601b10219d4d66f32970a192/16:9/w_2560%2Cc_limit/1097988940",
  "https://lp-cms-production.imgix.net/2019-06/GettyImages-543795991_large.jpg",
  "https://www.hilton.com/im/en/TPARWQQ/19324141/tparw-exterior.jpg?impolicy=crop&cw=5000&ch=2799&gravity=NorthWest&xposition=0&yposition=6&rw=768&rh=430",
];

const Hero: React.FC = () => {
  const [currentImage, setCurrentImage] = useState(0);
  const isMobile = useIsMobile();

  useEffect(() => {
    const timer = setInterval(
      () => setCurrentImage((prev) => (prev + 1) % images.length),
      5000
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="relative min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 pt-20 overflow-hidden">
      {/* Background carousel */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-black/40 z-10" />
        <img
          src={images[currentImage]}
          alt={`Slide ${currentImage + 1}`}
          className="w-full h-full object-cover transition-opacity duration-1000"
        />
      </div>

      {/* Agent image */}
      <img
        src="https://i.ibb.co/twxHY0vd/content.png"
        alt="Agent"
        className={`absolute bottom-0 ${
          isMobile
            ? "left-[30%] -translate-x-1/2 max-w-[80%] z-10"
            : "left-[10%] -translate-x-1/2 max-w-[475px] z-40"
        } pointer-events-none md:pointer-events-auto`}
      />

      {/* Desktop: blue button above white buttons, both centered at bottom; mobile unchanged */}
      <div>
        {/* Mobile: blue button and white buttons as before */}
        <div className="relative z-30 flex flex-col items-center md:hidden">
          <Link to="/videos?video=0" className="pointer-events-auto w-auto h-auto max-w-fit max-h-fit flex-shrink-0 flex-grow-0 px-6 py-3 md:px-12 md:py-4 bg-[#0057FF] text-white text-lg md:text-2xl font-semibold rounded-full shadow-lg hover:bg-[#0046cc] transition-colors duration-300 mt-4 md:mt-0 whitespace-nowrap flex items-center justify-center">
            Discover The Firm Title Advantage
          </Link>
          <div className="flex flex-col items-center gap-2 mt-2 pointer-events-auto w-full px-4">
            <Link to="/videos?video=3" className="px-2 py-1 bg-white/90 text-slate-900 text-sm font-semibold rounded-full shadow-lg hover:bg-blue-600 hover:text-white transition-colors duration-300 w-full flex items-center justify-center">
              Sellers: Close on Your Phone in 15 Minutes
            </Link>
            <Link to="/videos?video=1" className="px-2 py-1 bg-white/90 text-slate-900 text-sm font-semibold rounded-full shadow-lg hover:bg-blue-600 hover:text-white transition-colors duration-300 w-full flex items-center justify-center">
              Buyer Options for Owning a New Property
            </Link>
            <Link to="/videos?video=2" className="px-2 py-1 bg-white/90 text-slate-900 text-sm font-semibold rounded-full shadow-lg hover:bg-blue-600 hover:text-white transition-colors duration-300 w-full flex items-center justify-center">
              Commercial Property: Save Taxes with a 1031
            </Link>
          </div>
        </div>
        {/* Desktop: blue button above white buttons, both centered at bottom */}
        <div className="hidden md:flex flex-col items-center absolute bottom-12 left-0 right-4 z-30 pointer-events-auto md:ml-[325px]">
          <Link to="/videos?video=0" className="pointer-events-auto w-auto h-auto max-w-fit max-h-fit flex-shrink-0 flex-grow-0 px-14 py-4 bg-[#0057FF] text-white text-2xl font-semibold rounded-full shadow-lg hover:bg-[#0046cc] transition-colors duration-300 mb-40 flex items-center justify-center whitespace-nowrap">
            Discover The Firm Title Advantage
          </Link>
          <div className="flex justify-center gap-4 w-full">
            <Link to="/videos?video=3" className="px-6 py-4 bg-white/90 text-slate-900 text-base font-semibold rounded-full shadow-lg hover:bg-blue-600 hover:text-white transition-colors duration-300 flex items-center justify-center text-center">
              Sellers: Close on Your Phone in 15 Minutes
            </Link>
            <Link to="/videos?video=1" className="px-6 py-4 bg-white/90 text-slate-900 text-base font-semibold rounded-full shadow-lg hover:bg-blue-600 hover:text-white transition-colors duration-300 flex items-center justify-center text-center">
              Buyer Options for Owning a New Property
            </Link>
            <Link to="/videos?video=2" className="px-6 py-4 bg-white/90 text-slate-900 text-base font-semibold rounded-full shadow-lg hover:bg-blue-600 hover:text-white transition-colors duration-300 flex items-center justify-center text-center">
              Commercial Property: Save Taxes with a 1031
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
