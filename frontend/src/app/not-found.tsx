"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function NotFound() {
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({
        x: (e.clientX / window.innerWidth) * 100,
        y: (e.clientY / window.innerHeight) * 100,
      });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background">
      {/* Animated gradient background */}
      <div
        className="pointer-events-none absolute inset-0 transition-all duration-700 ease-out"
        style={{
          background: `radial-gradient(circle at ${mousePos.x}% ${mousePos.y}%, oklch(0.35 0.05 260 / 0.15), transparent 50%)`,
        }}
      />

      {/* Subtle grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "80px 80px",
        }}
      />

      {/* Large 404 background text */}
      <div className="pointer-events-none absolute select-none">
        <span className="text-[20rem] font-black leading-none tracking-tighter text-foreground/[0.03] sm:text-[28rem]">
          404
        </span>
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-8 px-6 text-center">
        {/* Animated line */}
        <div className="h-px w-16 animate-pulse bg-gradient-to-r from-transparent via-foreground/40 to-transparent" />

        <div className="flex flex-col items-center gap-3">
          <p className="text-sm font-medium uppercase tracking-[0.3em] text-muted-foreground">
            Page not found
          </p>
          <h1 className="text-5xl font-bold tracking-tight text-foreground sm:text-6xl">
            404
          </h1>
        </div>

        <p className="max-w-md text-base leading-relaxed text-muted-foreground">
          The page you are looking for doesn&apos;t exist or has been moved.
          Please check the URL or return to the homepage.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/"
            className="group inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-medium text-background transition-all hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-transform group-hover:-translate-x-0.5"
            >
              <path d="m12 19-7-7 7-7" />
              <path d="M19 12H5" />
            </svg>
            Back to Home
          </Link>
          <button
            onClick={() => window.history.back()}
            className="inline-flex h-11 items-center justify-center rounded-full border border-border px-6 text-sm font-medium text-foreground transition-all hover:bg-accent hover:scale-[1.02] active:scale-[0.98]"
          >
            Go Back
          </button>
        </div>

        {/* Animated line */}
        <div className="h-px w-16 animate-pulse bg-gradient-to-r from-transparent via-foreground/40 to-transparent" />
      </div>
    </div>
  );
}
