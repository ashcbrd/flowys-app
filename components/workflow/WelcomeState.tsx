"use client";

import { Sparkles, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { TemplateGalleryTrigger } from "./TemplateGallery";

export function WelcomeState() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
      {/* The same soft blue light the landing hero opens on, so an empty canvas
          feels like part of the same product rather than a blank grid. */}
      <div className="fy-light absolute inset-0" aria-hidden />

      <div
        className={cn(
          "relative flex flex-col items-center text-center p-10 rounded-3xl",
          "bg-background/85 backdrop-blur-md border shadow-[0_24px_60px_-32px_rgba(0,61,176,0.35)]",
          "animate-in fade-in-0 zoom-in-95 duration-500"
        )}
      >
        {/* Icon */}
        <div
          className={cn(
            "w-16 h-16 rounded-2xl flex items-center justify-center mb-4",
            "bg-gradient-to-br from-[var(--fy-blue)] to-[var(--fy-blue-deep)] text-white",
            "shadow-lg shadow-[rgba(10,108,255,0.25)]",
            "animate-pulse"
          )}
        >
          <Sparkles className="h-8 w-8" />
        </div>

        {/* Text */}
        <h2 className="fy-display text-2xl mb-2">Start building</h2>
        <p className="text-muted-foreground text-sm max-w-[240px] mb-4">
          Pick something that already works, or drag a step from below.
        </p>

        {/* The container disables pointer events so the canvas stays draggable
            through the overlay, re-enable them for the button itself. */}
        <div className="pointer-events-auto mb-4">
          <TemplateGalleryTrigger />
        </div>

        <p className="text-xs text-muted-foreground mb-2">or build your own</p>

        {/* Arrow pointing down */}
        <div className="animate-bounce">
          <ArrowDown className="h-5 w-5 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}
