import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const slides = [
  { src: "/hero/waterst.jpg",      position: "center 25%" },
  { src: "/hero/amphitheater.jpg", position: "center 25%" },
  { src: "/hero/ybor.jpg",         position: "center 30%" },
  { src: "/hero/golf.jpg",         position: "center 25%" },
];

const Hero: React.FC = () => {
  const [currentImage, setCurrentImage] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setCurrentImage((prev) => (prev + 1) % slides.length),
      5000
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="relative min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 pt-20 overflow-hidden">
      {/* Background carousel */}
      <div className="absolute inset-0">
        {slides.map((slide, i) => (
          <img
            key={slide.src}
            src={slide.src}
            alt=""
            aria-hidden={i !== currentImage}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
              i === currentImage ? "opacity-100" : "opacity-0"
            }`}
            style={{ objectPosition: slide.position }}
          />
        ))}
        {/* Legibility gradient — keeps the bottom buttons readable without darkening the subject */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/30 z-10" />
      </div>

      {/* Buttons */}
      <div>
        {/* Mobile: buttons pinned to bottom over the legibility gradient */}
        <div className="absolute bottom-6 left-0 right-0 z-30 flex flex-col items-center md:hidden pointer-events-auto">
          <Link to="/videos?video=0" className="pointer-events-auto w-auto h-auto max-w-fit max-h-fit flex-shrink-0 flex-grow-0 px-6 py-3 bg-[#0057FF] text-white text-lg font-semibold rounded-full shadow-lg hover:bg-[#0046cc] transition-colors duration-300 whitespace-nowrap flex items-center justify-center">
            Discover The Firm Title Advantage
          </Link>
          <div className="flex flex-col items-center gap-2 mt-3 pointer-events-auto w-full px-4">
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
        {/* Desktop: blue button above white buttons, centered at bottom */}
        <div className="hidden md:flex flex-col items-center absolute bottom-12 left-0 right-0 z-30 pointer-events-auto">
          <Link to="/videos?video=0" className="pointer-events-auto w-auto h-auto max-w-fit max-h-fit flex-shrink-0 flex-grow-0 px-14 py-4 bg-[#0057FF] text-white text-2xl font-semibold rounded-full shadow-lg hover:bg-[#0046cc] transition-colors duration-300 mb-6 flex items-center justify-center whitespace-nowrap">
            Discover The Firm Title Advantage
          </Link>
          <div className="flex justify-center gap-4">
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
