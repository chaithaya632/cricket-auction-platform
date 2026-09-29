'use client';

// =============================================================================
// ACC Match System — Embedded YouTube Live Player
// =============================================================================

import React from 'react';
import { Video, Radio } from 'lucide-react';

interface YouTubePlayerProps {
  videoId: string | null;
  title?: string;
  isLive?: boolean;
}

export function YouTubePlayer({ videoId, title = 'Live Match Stream', isLive = false }: YouTubePlayerProps) {
  if (!videoId) {
    return (
      <div className="relative w-full aspect-video rounded-2xl bg-zinc-900/90 border border-zinc-800 flex flex-col items-center justify-center text-center p-6 shadow-2xl overflow-hidden group">
        <div className="size-16 rounded-full bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-zinc-400 mb-3 group-hover:scale-105 transition-transform">
          <Video className="size-8" />
        </div>
        <h4 className="text-sm font-bold text-zinc-200 uppercase tracking-wider mb-1">
          Live Stream Offline
        </h4>
        <p className="text-xs text-zinc-400 max-w-sm">
          The video broadcast for this match will appear here once the stream goes live.
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-zinc-800 bg-black shadow-2xl">
      {isLive && (
        <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-600/90 backdrop-blur-md text-white text-[10px] font-black uppercase tracking-wider shadow-lg">
          <Radio className="size-3 animate-pulse" />
          <span>Live Broadcast</span>
        </div>
      )}
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&mute=1&playsinline=1&rel=0`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        className="w-full h-full border-0"
      />
    </div>
  );
}
