"use client";

import { useEffect, useRef } from "react";
import { withBasePath } from "@/lib/app-paths";

export function LoginBackground() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePlayback = () => {
      if (reducedMotion.matches || document.hidden) {
        video.pause();
      } else {
        void video.play().catch(() => {
          // Keep the poster visible when the browser blocks autoplay.
        });
      }
    };

    updatePlayback();
    reducedMotion.addEventListener("change", updatePlayback);
    document.addEventListener("visibilitychange", updatePlayback);
    return () => {
      video.pause();
      reducedMotion.removeEventListener("change", updatePlayback);
      document.removeEventListener("visibilitychange", updatePlayback);
    };
  }, []);

  return (
    <video
      ref={videoRef}
      aria-hidden="true"
      tabIndex={-1}
      muted
      loop
      playsInline
      preload="metadata"
      poster={withBasePath("/warehouse-background.webp")}
      className="pointer-events-none absolute inset-0 -z-20 h-full w-full object-cover"
    >
      <source src={withBasePath("/VDO_BG_login.mp4")} type="video/mp4" />
    </video>
  );
}
