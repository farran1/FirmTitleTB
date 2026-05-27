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

      {/* Firm Title Logo */}
      <img
        src={`${import.meta.env.BASE_URL}Firm%20Title%20logo%20-%20blue.jpg`}
        alt="Firm Title Logo"
        className="absolute top-20 z-40 w-20 md:w-28"
        style={{ pointerEvents: 'none', right: isMobile ? '0.75rem' : '2rem' }}
      />

      <main className="flex-grow">
        <Hero />
      </main>

      <Footer />
    </div>
  );
};

export default Index;
