import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Footer from "@/components/Footer";
import { useIsMobile } from "@/hooks/use-mobile";
import VideoCircle, { NavVideo } from "@/components/VideoCircle";
import { navVideos } from "@/data/navVideos";

const Index = () => {
  const isMobile = useIsMobile();

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-grow">
        <Hero />

        {/* Mobile: circle grid below the hero */}
        {isMobile && (
          <div className="container mx-auto px-4 py-12 grid grid-cols-2 gap-6 justify-items-center">
            {navVideos.map((vid: NavVideo) => (
              <VideoCircle
                key={vid.title}
                title={vid.title}
                videoLink={vid.videoLink}
                poster={vid.poster}
              />
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default Index;
