import { useEffect, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import VideoCircle from "@/components/VideoCircle";
import { navVideos } from "@/data/navVideos";

const images = [
  "https://media.cntraveler.com/photos/601b10219d4d66f32970a192/16:9/w_2560%2Cc_limit/1097988940",
  "https://lp-cms-production.imgix.net/2019-06/GettyImages-543795991_large.jpg",
  "https://www.hilton.com/im/en/TPARWQQ/19324141/tparw-exterior.jpg?impolicy=crop&cw=5000&ch=2799&gravity=NorthWest&xposition=0&yposition=6&rw=768&rh=430",
];

const Hero = () => {
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
            ? "left-[30%] -translate-x-1/2 max-w-[80%]"
            : "left-[10%] -translate-x-1/2 max-w-[500px]"
        } z-20`}
      />

      {/* Desktop‐only nav circles overlay */}
      {!isMobile && (
        <div className="absolute bottom-12 left-0 right-0 z-30">
          <div className="container mx-auto px-4 flex justify-center gap-6">
            {navVideos.map((vid) => (
              <VideoCircle
                key={vid.title}
                title={vid.title}
                videoLink={vid.videoLink}
                poster={vid.poster}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default Hero;
