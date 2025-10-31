import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Footer from "@/components/Footer";
import { useIsMobile } from "@/hooks/use-mobile";
import { navVideos, NavVideo } from "@/data/navVideos";
import VideoCircle from "@/components/VideoCircle";


const Index = () => {
  const isMobile = useIsMobile();

  return (
    <div className="min-h-screen flex flex-col relative">
      <Navbar />

      {/* Firm Title Logo - Desktop only */}
      <img
        src={`${import.meta.env.BASE_URL}Firm%20Title%20logo%20-%20blue.jpg`}
        alt="Firm Title Logo"
        className="hidden md:block absolute top-20 right-8 w-28 z-40"
        style={{ pointerEvents: 'none' }}
      />

      <main className="flex-grow">
        <Hero />
      </main>

      <Footer />
    </div>
  );
};

export default Index;
