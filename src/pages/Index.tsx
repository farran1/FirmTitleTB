import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Footer from "@/components/Footer";
import { useIsMobile } from "@/hooks/use-mobile";
import { navVideos, NavVideo } from "@/data/navVideos";
import VideoCircle from "@/components/VideoCircle";


const Index = () => {
  const isMobile = useIsMobile();

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-grow">
        <Hero />
      </main>

      <Footer />
    </div>
  );
};

export default Index;
