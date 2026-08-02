"use client";

import { DragEvent, useState } from "react";
import {
  BookOpenText,
  FileInput,
  Globe,
  Sparkles,
  GitBranch,
  FileOutput,
  Image as ImageIcon,
  Mail,
  Palette,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useWorkflowStore, type NodeType } from "@/store/workflow";
import { COMING_SOON_LABEL } from "@/lib/features";

interface DockItem {
  /** The kind of step this tile creates. */
  type: NodeType;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  gradient: string;
  /** Visible but not usable yet. */
  comingSoon?: boolean;
}

const nodeTypes: DockItem[] = [
  {
    type: "input",
    label: "Input",
    description: "Start your workflow with user input",
    icon: <FileInput className="h-5 w-5" />,
    color: "bg-emerald-500",
    gradient: "from-emerald-400 to-emerald-600",
  },
  {
    type: "api",
    label: "API",
    description: "Fetch data from external services",
    icon: <Globe className="h-5 w-5" />,
    color: "bg-sky-500",
    gradient: "from-sky-400 to-sky-600",
  },
  {
    type: "ai",
    label: "AI",
    description: "Process with artificial intelligence",
    icon: <Sparkles className="h-5 w-5" />,
    color: "bg-violet-500",
    gradient: "from-violet-400 to-violet-600",
  },
  {
    type: "retrieval",
    label: "Your docs",
    description: "Search the documents you've added and hand the best passages to the next step",
    icon: <BookOpenText className="h-5 w-5" />,
    color: "bg-teal-500",
    gradient: "from-teal-400 to-teal-600",
  },
  {
    type: "image",
    label: "Picture",
    description: "Create an image from a description",
    icon: <ImageIcon className="h-5 w-5" />,
    color: "bg-fuchsia-500",
    gradient: "from-fuchsia-400 to-fuchsia-600",
  },
  {
    type: "brand",
    label: "Brand kit",
    description: "Turn a logo into mockups, a colour palette, and a brand board",
    icon: <Palette className="h-5 w-5" />,
    color: "bg-pink-500",
    gradient: "from-pink-400 to-pink-600",
  },
  {
    type: "email",
    label: "Email",
    description: "Assemble a branded email that renders properly everywhere",
    icon: <Mail className="h-5 w-5" />,
    color: "bg-orange-500",
    gradient: "from-orange-400 to-orange-600",
  },
  {
    type: "logic",
    label: "Logic",
    description: "Transform, filter, or route data",
    icon: <GitBranch className="h-5 w-5" />,
    color: "bg-amber-500",
    gradient: "from-amber-400 to-amber-600",
  },
  // The integration ("Apps") and webhook tiles are deliberately absent. Apps
  // has no working connections yet, and the webhook step earned its keep as a
  // template tail rather than something people reached for, so neither
  // belongs in the palette. Both step types stay registered in the engine and
  // the canvas, so any saved workflow that already carries one keeps running
  // and rendering.
  {
    type: "output",
    label: "Output",
    description: "Return the final result",
    icon: <FileOutput className="h-5 w-5" />,
    color: "bg-rose-500",
    gradient: "from-rose-400 to-rose-600",
  },
];

const MAX_NODE_COUNT = 50;

export function NodeDock() {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const { toast } = useToast();
  const nodes = useWorkflowStore((state) => state.nodes);
  const addNode = useWorkflowStore((state) => state.addNode);

  const nodeCount = nodes.length;
  const isAtNodeLimit = nodeCount >= MAX_NODE_COUNT;

  const onDragStart = (event: DragEvent, node: DockItem) => {
    if (node.comingSoon) {
      event.preventDefault();
      toast({
        title: `${node.label}: ${COMING_SOON_LABEL}`,
        description: "Connecting other apps isn't ready yet. Everything else works.",
      });
      return;
    }

    if (isAtNodeLimit) {
      event.preventDefault();
      toast({
        title: "That's the limit",
        description: `A workflow can have up to ${MAX_NODE_COUNT} steps.`,
        variant: "destructive",
      });
      return;
    }

    event.dataTransfer.setData("application/reactflow", node.type);
    event.dataTransfer.effectAllowed = "move";
  };

  /**
   * Tapping adds the step, which is the only way in on a touch screen.
   *
   * Dragging is an HTML5 drag and never fires from a finger, so on a phone the
   * dock was decoration. A tap drops the step to the right of the last one, on a
   * gentle diagonal, so a tapped-together workflow still reads left to right.
   */
  const addByTap = (node: DockItem) => {
    if (node.comingSoon) {
      toast({
        title: `${node.label}: ${COMING_SOON_LABEL}`,
        description: "Connecting other apps isn't ready yet. Everything else works.",
      });
      return;
    }

    if (isAtNodeLimit) {
      toast({
        title: "That's the limit",
        description: `A workflow can have up to ${MAX_NODE_COUNT} steps.`,
        variant: "destructive",
      });
      return;
    }

    const last = nodes[nodes.length - 1];
    const position = last
      ? { x: last.position.x + 320, y: last.position.y + 40 }
      : { x: 120, y: 160 };

    addNode(node.type, position);
    toast({
      title: `${node.label} step added`,
      description: "Tap it to set it up.",
    });
  };

  // Calculate scale for dock magnification effect
  const getScale = (index: number) => {
    if (hoveredIndex === null) return 1;
    const distance = Math.abs(index - hoveredIndex);
    if (distance === 0) return 1.25;
    if (distance === 1) return 1.1;
    return 1;
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-[calc(100vw-1.5rem)]">
        {/* Floating dock container */}
        <div
          className={cn(
            "flex items-end gap-1 px-3 py-2.5 rounded-2xl",
            "overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            // Glassmorphism effect
            "bg-white/70 dark:bg-gray-900/70",
            "backdrop-blur-xl backdrop-saturate-150",
            "border border-white/20 dark:border-white/10",
            "shadow-[0_8px_32px_rgba(0,0,0,0.12),0_0_0_1px_rgba(255,255,255,0.1)_inset]",
            "dark:shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.05)_inset]"
          )}
        >
          {nodeTypes.map((node, index) => {
            return (
              <Tooltip key={node.type}>
                <TooltipTrigger asChild>
                  <div
                    draggable={!node.comingSoon}
                    onDragStart={(e) => onDragStart(e, node)}
                    onClick={() => addByTap(node)}
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    style={{
                      transform: `scale(${getScale(index)})`,
                      transformOrigin: "bottom center",
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 p-2 rounded-xl",
                      "transition-all duration-200 ease-out",
                      "select-none relative",
                      node.comingSoon
                        ? "cursor-not-allowed opacity-50"
                        : "cursor-pointer hover:bg-white/50 dark:hover:bg-white/10 active:scale-95 sm:cursor-grab sm:active:cursor-grabbing"
                    )}
                  >
                    {/* Icon container with gradient */}
                    <div
                      className={cn(
                        "w-11 h-11 rounded-xl flex items-center justify-center text-white relative",
                        "bg-gradient-to-br shadow-lg",
                        "transition-shadow duration-200",
                        hoveredIndex === index && "shadow-xl",
                        node.gradient
                      )}
                    >
                      {node.icon}
                    </div>
                    {/* Label */}
                    <span
                      className={cn(
                        "text-[10px] font-medium text-foreground/70",
                        "transition-colors duration-200",
                        hoveredIndex === index && "text-foreground"
                      )}
                    >
                      {node.label}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  sideOffset={8}
                  className="bg-background/95 backdrop-blur-sm"
                >
                  <p className="font-medium">
                    {node.label}
                    {node.comingSoon && (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        {COMING_SOON_LABEL}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {node.comingSoon
                      ? "Connecting other apps isn't ready yet."
                      : node.description}
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Node count indicator */}
        <div
          className={cn(
            "absolute -top-8 left-1/2 -translate-x-1/2 text-xs px-2 py-1 rounded-full font-medium",
            "bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border border-white/20 dark:border-white/10 shadow-sm",
            isAtNodeLimit
              ? "text-red-600 dark:text-red-400"
              : nodeCount >= MAX_NODE_COUNT * 0.75
              ? "text-amber-600 dark:text-amber-400"
              : "text-muted-foreground"
          )}
        >
          {nodeCount} / {MAX_NODE_COUNT} steps
        </div>

        {/* Subtle reflection effect */}
        <div
          className={cn(
            "absolute -bottom-3 left-1/2 -translate-x-1/2 w-[80%] h-4",
            "bg-gradient-to-b from-black/5 to-transparent dark:from-white/5",
            "rounded-full blur-sm opacity-50"
          )}
        />
      </div>
    </TooltipProvider>
  );
}
