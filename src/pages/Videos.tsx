import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { navVideos } from "@/data/navVideos";
import { useLocation } from "react-router-dom";
import { useEffect, useRef } from "react";

// Map each video to its correct YouTube link, title, and synopsis
const videoData = [
  {
    title: "The Firm Title Advantage",
    youtube: "https://www.youtube.com/embed/gQCJtWO504k",
    synopsis: "A general overview of Firm Title's unique advantages for all clients."
  },
  {
    title: "Buyer Options for Owning a New Property",
    youtube: "https://www.youtube.com/embed/SBvRb4YsRDY",
    synopsis: "Explore buyer options for owning a new property in Florida."
  },
  {
    title: "Commercial Property: Save Taxes with a 1031",
    youtube: "https://www.youtube.com/embed/s78pDSlDnzs",
    synopsis: "How commercial property owners can save taxes with a 1031 exchange."
  },
  {
    title: "Sellers: Close on Your Phone in 15 Minutes",
    youtube: "https://www.youtube.com/embed/kpInBI9Rd4A",
    synopsis: "How sellers can close on their phone in 15 minutes with Firm Title."
  },
];

const Videos = () => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const selectedVideo = parseInt(params.get("video") || "");
  const videoRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];

  useEffect(() => {
    if (!isNaN(selectedVideo) && videoRefs[selectedVideo]) {
      videoRefs[selectedVideo].current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selectedVideo]);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex-grow pt-20">
        <div className="container mx-auto px-4 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {videoData.map((video, i) => {
              // Add autoplay and captions if this is the selected video
              let src = video.youtube;
              if (selectedVideo === i) {
                src += (src.includes('?') ? '&' : '?') + 'autoplay=1&cc_load_policy=1';
              }
              return (
                <div
                  key={video.youtube}
                  ref={videoRefs[i]}
                  className="bg-white/80 rounded-lg shadow-md p-6 flex flex-col items-center"
                >
                  <div className="w-full aspect-video mb-4">
                    <iframe
                      width="100%"
                      height="100%"
                      src={src}
                      title={video.title}
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="rounded-lg w-full h-full"
                    />
                  </div>
                  <h2 className="text-xl font-semibold mb-2 text-slate-800 text-center">{video.title}</h2>
                  <p className="text-slate-600 text-center text-sm">{video.synopsis}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Videos;
