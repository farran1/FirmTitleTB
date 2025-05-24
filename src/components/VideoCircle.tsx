import React from "react";
import { PlayCircle } from "lucide-react";

export interface VideoCircleProps {
  title: string;
  videoLink: string;
  poster?: string; // optional thumbnail URL
}

const VideoCircle: React.FC<VideoCircleProps> = ({
  title,
  videoLink,
  poster,
}) => {
  const sizeClasses = "w-[150px] h-[150px] md:w-[200px] md:h-[200px]";

  return (
    <div
      onClick={() => window.open(videoLink, "_blank")}
      title={title}
      className={`
        ${sizeClasses}
        rounded-full
        overflow-hidden
        relative
        flex items-center justify-center
        cursor-pointer
        transition-transform hover:scale-105
      `}
    >
      {/* Poster image or fallback bg */}
      {poster ? (
        <img
          src={poster}
          alt={title}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full bg-gray-300" />
      )}

      {/* Dark overlay + play icon */}
      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
        <PlayCircle size={48} className="text-white" />
      </div>
    </div>
  );
};

export default VideoCircle;
