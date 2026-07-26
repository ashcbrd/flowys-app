"use client";

import { Sparkles, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { TemplateGalleryTrigger } from "./TemplateGallery";

export function WelcomeState() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
      <div
        className={cn(
          "flex flex-col items-center text-center p-8 rounded-2xl",
          "bg-background/80 backdrop-blur-sm border shadow-lg",
          "animate-in fade-in-0 zoom-in-95 duration-500"
        )}
      >
        {/* Icon */}
        <div
          className={cn(
            "w-16 h-16 rounded-2xl flex items-center justify-center mb-4",
            "bg-gradient-to-br from-blue-500 to-indigo-600 text-white",
            "shadow-lg shadow-blue-500/25",
            "animate-pulse"
          )}
        >
          <Sparkles className="h-8 w-8" />
        </div>

        {/* Text */}
        <h2 className="text-xl font-semibold mb-2">Start Building</h2>
        <p className="text-muted-foreground text-sm max-w-[240px] mb-4">
          Pick something that already works, or drag a step from below.
        </p>

        {/* The container disables pointer events so the canvas stays draggable
            through the overlay — re-enable them for the button itself. */}
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
