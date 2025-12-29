"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Zap,
  ArrowRight,
  ArrowLeft,
  FileInput,
  Sparkles,
  FileOutput,
  Play,
  Check,
  MousePointer2,
  GripVertical,
  Settings,
  ChevronRight,
  Rocket,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";

// Tutorial steps
const STEPS = [
  {
    id: "welcome",
    title: "Let's build something",
    subtitle: "Your first AI workflow in under 3 minutes",
  },
  {
    id: "add-node",
    title: "Drag your first node",
    subtitle: "Everything starts with an input",
  },
  {
    id: "configure-input",
    title: "Define your input",
    subtitle: "Tell the workflow what data to expect",
  },
  {
    id: "connect-nodes",
    title: "Connect the dots",
    subtitle: "Data flows from left to right",
  },
  {
    id: "configure-ai",
    title: "Add the AI magic",
    subtitle: "One prompt. Endless possibilities.",
  },
  {
    id: "add-output",
    title: "Capture the result",
    subtitle: "Every workflow needs an output",
  },
  {
    id: "run-workflow",
    title: "Hit run",
    subtitle: "Watch your workflow come alive",
  },
  {
    id: "complete",
    title: "You're a builder now",
    subtitle: "Go make something great",
  },
];

export default function TutorialPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [animationPhase, setAnimationPhase] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);

  const step = STEPS[currentStep];
  const progress = ((currentStep + 1) / STEPS.length) * 100;

  // Reset animation phase when step changes
  useEffect(() => {
    setAnimationPhase(0);
    const timer = setTimeout(() => setAnimationPhase(1), 500);
    return () => clearTimeout(timer);
  }, [currentStep]);

  // Show confetti on completion
  useEffect(() => {
    if (step.id === "complete") {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [step.id]);

  const nextStep = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-slate-900">
      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold">Flowys</span>
            <span className="text-sm text-muted-foreground ml-2">Tutorial</span>
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button variant="outline" asChild>
              <Link href="/workflow">
                Skip to Editor
                <X className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="h-1 bg-muted">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Step Indicator */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-center gap-2">
          {STEPS.map((s, index) => (
            <div
              key={s.id}
              className={cn(
                "w-2.5 h-2.5 rounded-full transition-all duration-300",
                index === currentStep
                  ? "w-8 bg-blue-500"
                  : index < currentStep
                  ? "bg-blue-500"
                  : "bg-muted-foreground/30"
              )}
            />
          ))}
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 pb-24">
        {/* Step Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">{step.title}</h1>
          <p className="text-lg text-muted-foreground">{step.subtitle}</p>
        </div>

        {/* Tutorial Content */}
        <div className="bg-background rounded-2xl border shadow-xl overflow-hidden min-h-[500px]">
          {step.id === "welcome" && <WelcomeStep onNext={nextStep} />}
          {step.id === "add-node" && <AddNodeStep phase={animationPhase} />}
          {step.id === "configure-input" && <ConfigureInputStep phase={animationPhase} />}
          {step.id === "connect-nodes" && <ConnectNodesStep phase={animationPhase} />}
          {step.id === "configure-ai" && <ConfigureAIStep phase={animationPhase} />}
          {step.id === "add-output" && <AddOutputStep phase={animationPhase} />}
          {step.id === "run-workflow" && <RunWorkflowStep phase={animationPhase} />}
          {step.id === "complete" && <CompleteStep showConfetti={showConfetti} />}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8">
          <Button
            variant="outline"
            onClick={prevStep}
            disabled={currentStep === 0}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Previous
          </Button>

          <span className="text-sm text-muted-foreground">
            Step {currentStep + 1} of {STEPS.length}
          </span>

          {currentStep < STEPS.length - 1 ? (
            <Button onClick={nextStep} className="gap-2 bg-gradient-to-r from-blue-500 to-indigo-600">
              Next
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button asChild className="gap-2 bg-gradient-to-r from-blue-500 to-indigo-600">
              <Link href="/workflow">
                Open Editor
                <Rocket className="h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}

// Animated Arrow Component
function AnimatedArrow({
  direction = "down",
  className,
}: {
  direction?: "up" | "down" | "left" | "right";
  className?: string;
}) {
  const rotations = {
    up: "rotate-180",
    down: "rotate-0",
    left: "rotate-90",
    right: "-rotate-90",
  };

  return (
    <div className={cn("animate-bounce", className)}>
      <svg
        width="40"
        height="40"
        viewBox="0 0 40 40"
        className={cn("text-blue-500", rotations[direction])}
      >
        <path
          d="M20 5 L20 30 M10 20 L20 30 L30 20"
          stroke="currentColor"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

// Pulsing Dot Component
function PulsingDot({ className }: { className?: string }) {
  return (
    <span className={cn("relative flex h-3 w-3", className)}>
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
    </span>
  );
}

// Mock Node Component
function MockNode({
  type,
  label,
  color,
  icon: Icon,
  selected,
  preview,
  className,
  onClick,
}: {
  type: string;
  label: string;
  color: string;
  icon: any;
  selected?: boolean;
  preview?: string;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "w-52 rounded-xl border-2 bg-card shadow-lg transition-all cursor-pointer",
        selected ? "border-blue-500 ring-4 ring-blue-500/20 scale-105" : "border-border/50",
        className
      )}
    >
      <div className={cn("flex items-center gap-2 px-3 py-2.5 rounded-t-lg text-white", color)}>
        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
          <Icon className="h-4 w-4" />
        </div>
        <span className="font-medium text-sm">{label}</span>
      </div>
      <div className="px-3 py-2.5 text-xs text-muted-foreground">
        {preview || "Click to configure"}
      </div>
      {/* Handles */}
      {type !== "input" && (
        <div className="absolute left-0 top-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-blue-500 border-2 border-background" />
      )}
      {type !== "output" && (
        <div className="absolute right-0 top-1/2 translate-x-1/2 w-3 h-3 rounded-full bg-blue-500 border-2 border-background" />
      )}
    </div>
  );
}

// Mock Dock Component with Drag support
function MockDock({
  highlightType,
}: {
  highlightType?: string;
}) {
  const [draggingType, setDraggingType] = useState<string | null>(null);
  const dragImageRef = useRef<HTMLDivElement>(null);

  const nodes = [
    { type: "input", label: "Input", color: "from-emerald-400 to-emerald-600", bgColor: "bg-emerald-500", icon: FileInput },
    { type: "ai", label: "AI", color: "from-violet-400 to-violet-600", bgColor: "bg-violet-500", icon: Sparkles },
    { type: "output", label: "Output", color: "from-rose-400 to-rose-600", bgColor: "bg-rose-500", icon: FileOutput },
  ];

  const handleDragStart = (e: React.DragEvent, node: typeof nodes[0]) => {
    setDraggingType(node.type);
    e.dataTransfer.setData("nodeType", node.type);
    e.dataTransfer.effectAllowed = "copy";

    // Create custom drag image
    const dragImage = document.createElement("div");
    dragImage.className = `flex flex-col items-center gap-1 p-2 rounded-xl bg-white shadow-xl border`;
    dragImage.innerHTML = `
      <div class="w-10 h-10 rounded-lg flex items-center justify-center text-white ${node.bgColor} shadow-md">
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          ${node.type === "input" ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>' : ""}
          ${node.type === "ai" ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"></path>' : ""}
          ${node.type === "output" ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>' : ""}
        </svg>
      </div>
      <span class="text-xs font-medium text-gray-700">${node.label}</span>
    `;
    dragImage.style.position = "absolute";
    dragImage.style.top = "-1000px";
    dragImage.style.left = "-1000px";
    document.body.appendChild(dragImage);

    e.dataTransfer.setDragImage(dragImage, 30, 30);

    // Clean up after a short delay
    setTimeout(() => {
      document.body.removeChild(dragImage);
    }, 0);
  };

  const handleDragEnd = () => {
    setDraggingType(null);
  };

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
      <div ref={dragImageRef} className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border shadow-xl">
        {nodes.map((node) => (
          <div
            key={node.type}
            draggable
            onDragStart={(e) => handleDragStart(e, node)}
            onDragEnd={handleDragEnd}
            className={cn(
              "flex flex-col items-center gap-1 p-2 rounded-xl cursor-grab active:cursor-grabbing transition-all select-none",
              "hover:bg-white/50 dark:hover:bg-white/10 hover:scale-110",
              highlightType === node.type && "ring-2 ring-blue-500 ring-offset-2 animate-pulse",
              draggingType === node.type && "opacity-50 scale-95"
            )}
          >
            <div
              className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center text-white bg-gradient-to-br shadow-md pointer-events-none",
                node.color
              )}
            >
              <node.icon className="h-5 w-5" />
            </div>
            <span className="text-[10px] font-medium text-muted-foreground pointer-events-none">{node.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Drop Zone Component
function DropZone({
  onDrop,
  acceptType,
  children,
  className,
  disabled = false
}: {
  onDrop: (type: string) => void;
  acceptType?: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (disabled) return;
    e.preventDefault();
    setIsDragOver(false);
    const nodeType = e.dataTransfer.getData("nodeType");
    if (nodeType && (!acceptType || acceptType === nodeType)) {
      onDrop(nodeType);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "transition-all duration-200",
        isDragOver && !disabled && "ring-4 ring-blue-500/30 bg-blue-500/5",
        className
      )}
    >
      {children}
      {isDragOver && !disabled && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="px-4 py-2 bg-blue-500 text-white rounded-full text-sm font-medium animate-pulse">
            Drop here!
          </div>
        </div>
      )}
    </div>
  );
}

// Step Components
function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-[500px] p-8 text-center">
      <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-8 shadow-xl animate-pulse">
        <Zap className="h-12 w-12 text-white" />
      </div>
      <h2 className="text-2xl font-bold mb-4">See how easy this is</h2>
      <p className="text-muted-foreground max-w-md mb-8">
        We'll build a text summarizer together. You'll drag 3 nodes,
        connect them, and run your first AI workflow. Ready?
      </p>
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-8 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-white">
              <FileInput className="h-4 w-4" />
            </div>
            <span>Input</span>
          </div>
          <ArrowRight className="h-4 w-4" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-500 flex items-center justify-center text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <span>AI Process</span>
          </div>
          <ArrowRight className="h-4 w-4" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-rose-500 flex items-center justify-center text-white">
              <FileOutput className="h-4 w-4" />
            </div>
            <span>Output</span>
          </div>
        </div>
        <Button onClick={onNext} size="lg" className="mt-4 gap-2 bg-gradient-to-r from-blue-500 to-indigo-600">
          Let's Go
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function AddNodeStep({ phase }: { phase: number }) {
  const [nodeAdded, setNodeAdded] = useState(false);

  return (
    <div className="relative h-[500px]">
      <DropZone
        onDrop={(type) => {
          if (type === "input") setNodeAdded(true);
        }}
        acceptType="input"
        className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#374151_1px,transparent_1px)] [background-size:20px_20px]"
      >
        {/* Canvas area */}
        <div className="absolute inset-0 flex items-center justify-center">
          {nodeAdded ? (
            <div className="relative animate-in fade-in zoom-in duration-500">
              <MockNode
                type="input"
                label="Input"
                color="bg-gradient-to-r from-emerald-400 to-emerald-600"
                icon={FileInput}
                selected
              />
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-green-500 text-white px-3 py-1.5 rounded-full text-sm font-medium">
                <Check className="h-4 w-4" />
                Node Added!
              </div>
            </div>
          ) : (
            <div className="text-center text-muted-foreground border-2 border-dashed border-muted-foreground/30 rounded-xl p-8">
              <GripVertical className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p>Drop Input node here</p>
            </div>
          )}
        </div>
      </DropZone>

      {/* Instruction overlay */}
      {!nodeAdded && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-blue-500 text-white px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 shadow-lg z-10">
          <GripVertical className="h-4 w-4" />
          Drag the Input node from the dock to the canvas
        </div>
      )}

      {/* Animated arrow pointing to dock */}
      {!nodeAdded && (
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-10">
          <AnimatedArrow direction="down" />
        </div>
      )}

      {/* Mock Dock */}
      <MockDock highlightType={!nodeAdded ? "input" : undefined} />

      {/* Pulsing indicator on Input */}
      {!nodeAdded && (
        <div className="absolute bottom-[76px] left-[calc(50%-88px)] z-10">
          <PulsingDot />
        </div>
      )}
    </div>
  );
}

function ConfigureInputStep({ phase }: { phase: number }) {
  const [configured, setConfigured] = useState(false);

  return (
    <div className="relative h-[500px] flex">
      {/* Canvas */}
      <div className="flex-1 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#374151_1px,transparent_1px)] [background-size:20px_20px] flex items-center justify-center">
        <div className="relative">
          <MockNode
            type="input"
            label="Input"
            color="bg-gradient-to-r from-emerald-400 to-emerald-600"
            icon={FileInput}
            selected={!configured}
            preview={configured ? "1 field: text" : undefined}
          />
          {!configured && (
            <div className="absolute -right-16 top-1/2 -translate-y-1/2">
              <AnimatedArrow direction="right" />
            </div>
          )}
        </div>
      </div>

      {/* Config Panel */}
      <div className="w-80 border-l bg-card p-4">
        <div className="flex items-center gap-2 mb-4 pb-4 border-b">
          <Settings className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Configure Input</span>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Field Name</label>
            <input
              type="text"
              defaultValue="text"
              className="w-full px-3 py-2 border rounded-lg text-sm bg-background"
              readOnly
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Field Type</label>
            <select className="w-full px-3 py-2 border rounded-lg text-sm bg-background">
              <option>Text</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Description</label>
            <input
              type="text"
              defaultValue="Enter text to process"
              className="w-full px-3 py-2 border rounded-lg text-sm bg-background"
              readOnly
            />
          </div>

          {!configured && (
            <div className="relative">
              <Button
                onClick={() => setConfigured(true)}
                className="w-full gap-2 bg-gradient-to-r from-blue-500 to-indigo-600"
              >
                <Check className="h-4 w-4" />
                Save Configuration
              </Button>
              <PulsingDot className="absolute -top-1 -right-1" />
            </div>
          )}

          {configured && (
            <div className="flex items-center gap-2 text-green-600 text-sm">
              <Check className="h-4 w-4" />
              Configuration saved!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConnectNodesStep({ phase }: { phase: number }) {
  const [step, setStep] = useState(0); // 0: add AI, 1: connect, 2: done
  const [isDraggingConnection, setIsDraggingConnection] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("connection", "true");
    e.dataTransfer.effectAllowed = "link";
    setIsDraggingConnection(true);
  };

  const handleDragEnd = () => {
    setIsDraggingConnection(false);
  };

  const handleDropOnTarget = (e: React.DragEvent) => {
    e.preventDefault();
    const isConnection = e.dataTransfer.getData("connection");
    if (isConnection && step === 1) {
      setStep(2);
    }
    setIsDraggingConnection(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "link";
  };

  return (
    <div className="relative h-[500px]">
      <DropZone
        onDrop={(type) => {
          if (type === "ai" && step === 0) setStep(1);
        }}
        acceptType="ai"
        disabled={step >= 1}
        className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#374151_1px,transparent_1px)] [background-size:20px_20px]"
      >
        {/* Instruction */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-blue-500 text-white px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 shadow-lg z-10">
          {step === 0 && <GripVertical className="h-4 w-4" />}
          {step === 1 && <GripVertical className="h-4 w-4" />}
          {step === 2 && <Check className="h-4 w-4" />}
          {step === 0 && "Drag the AI node to the canvas"}
          {step === 1 && "Drag from the blue dot to connect nodes"}
          {step === 2 && "Nodes connected!"}
        </div>

        {/* Nodes */}
        <div className="absolute inset-0 flex items-center justify-center gap-24">
          {/* Input Node */}
          <div className="relative">
            <MockNode
              type="input"
              label="Input"
              color="bg-gradient-to-r from-emerald-400 to-emerald-600"
              icon={FileInput}
              preview="1 field: text"
            />
            {/* Output handle - draggable connection point */}
            {step >= 1 && (
              <div
                draggable={step === 1}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                className={cn(
                  "absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-blue-500 border-2 border-background transition-all z-20",
                  step === 1 && "cursor-grab active:cursor-grabbing hover:scale-150 animate-pulse hover:bg-blue-400",
                  isDraggingConnection && "scale-150 bg-blue-400"
                )}
              />
            )}
          </div>

          {/* Drop zone indicator for AI node */}
          {step === 0 && (
            <div className="text-center text-muted-foreground border-2 border-dashed border-muted-foreground/30 rounded-xl p-8">
              <GripVertical className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Drop AI node here</p>
            </div>
          )}

          {/* Connection Line */}
          {step === 2 && (
            <div className="absolute left-1/2 top-1/2 -translate-y-1/2 w-20 h-0.5">
              <div className="w-full h-full bg-gradient-to-r from-blue-500 to-violet-500 animate-in slide-in-from-left duration-500" />
            </div>
          )}

          {/* AI Node */}
          {step >= 1 && (
            <div className="relative animate-in fade-in zoom-in duration-300">
              <MockNode
                type="ai"
                label="AI"
                color="bg-gradient-to-r from-violet-400 to-violet-600"
                icon={Sparkles}
                selected={step === 1}
              />
              {/* Input handle - drop target */}
              {step >= 1 && (
                <div
                  onDrop={handleDropOnTarget}
                  onDragOver={handleDragOver}
                  className={cn(
                    "absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-blue-500 border-2 border-background transition-all z-20",
                    isDraggingConnection && "scale-150 bg-green-500 animate-pulse"
                  )}
                />
              )}
            </div>
          )}
        </div>
      </DropZone>

      {/* Arrow pointing to dock */}
      {step === 0 && (
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-10">
          <AnimatedArrow direction="down" />
        </div>
      )}

      {/* Arrow pointing to connection */}
      {step === 1 && (
        <div className="absolute left-[calc(50%-60px)] top-1/2 -translate-y-1/2 z-10">
          <AnimatedArrow direction="right" />
        </div>
      )}

      {/* Mock Dock */}
      <MockDock highlightType={step === 0 ? "ai" : undefined} />
    </div>
  );
}

function ConfigureAIStep({ phase }: { phase: number }) {
  const [configured, setConfigured] = useState(false);

  return (
    <div className="relative h-[500px] flex">
      {/* Canvas */}
      <div className="flex-1 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#374151_1px,transparent_1px)] [background-size:20px_20px] flex items-center justify-center gap-16">
        <MockNode
          type="input"
          label="Input"
          color="bg-gradient-to-r from-emerald-400 to-emerald-600"
          icon={FileInput}
          preview="1 field: text"
        />
        <div className="w-16 h-0.5 bg-gradient-to-r from-blue-500 to-violet-500" />
        <div className="relative">
          <MockNode
            type="ai"
            label="AI"
            color="bg-gradient-to-r from-violet-400 to-violet-600"
            icon={Sparkles}
            selected={!configured}
            preview={configured ? "Summarize text" : undefined}
          />
          {!configured && (
            <div className="absolute -right-16 top-1/2 -translate-y-1/2">
              <AnimatedArrow direction="right" />
            </div>
          )}
        </div>
      </div>

      {/* Config Panel */}
      <div className="w-80 border-l bg-card p-4">
        <div className="flex items-center gap-2 mb-4 pb-4 border-b">
          <Settings className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Configure AI Node</span>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Provider</label>
            <select className="w-full px-3 py-2 border rounded-lg text-sm bg-background">
              <option>OpenAI</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Model</label>
            <select className="w-full px-3 py-2 border rounded-lg text-sm bg-background">
              <option>gpt-4o</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Prompt</label>
            <textarea
              className="w-full px-3 py-2 border rounded-lg text-sm bg-background h-24 resize-none"
              defaultValue="Summarize the following text in 2-3 sentences: {{text}}"
              readOnly
            />
            <p className="text-xs text-muted-foreground mt-1">
              Use {"{{text}}"} to reference input data
            </p>
          </div>

          {!configured && (
            <div className="relative">
              <Button
                onClick={() => setConfigured(true)}
                className="w-full gap-2 bg-gradient-to-r from-blue-500 to-indigo-600"
              >
                <Check className="h-4 w-4" />
                Save Configuration
              </Button>
              <PulsingDot className="absolute -top-1 -right-1" />
            </div>
          )}

          {configured && (
            <div className="flex items-center gap-2 text-green-600 text-sm">
              <Check className="h-4 w-4" />
              AI node configured!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AddOutputStep({ phase }: { phase: number }) {
  const [step, setStep] = useState(0); // 0: add, 1: connect, 2: done
  const [isDraggingConnection, setIsDraggingConnection] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("connection", "true");
    e.dataTransfer.effectAllowed = "link";
    setIsDraggingConnection(true);
  };

  const handleDragEnd = () => {
    setIsDraggingConnection(false);
  };

  const handleDropOnTarget = (e: React.DragEvent) => {
    e.preventDefault();
    const isConnection = e.dataTransfer.getData("connection");
    if (isConnection && step === 1) {
      setStep(2);
    }
    setIsDraggingConnection(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "link";
  };

  return (
    <div className="relative h-[500px]">
      <DropZone
        onDrop={(type) => {
          if (type === "output" && step === 0) setStep(1);
        }}
        acceptType="output"
        disabled={step >= 1}
        className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#374151_1px,transparent_1px)] [background-size:20px_20px]"
      >
        {/* Instruction */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-blue-500 text-white px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 shadow-lg z-10">
          {step === 0 && <GripVertical className="h-4 w-4" />}
          {step === 1 && <GripVertical className="h-4 w-4" />}
          {step === 2 && <Check className="h-4 w-4" />}
          {step === 0 && "Drag the Output node to the canvas"}
          {step === 1 && "Drag from the blue dot to connect nodes"}
          {step === 2 && "Workflow complete!"}
        </div>

        {/* Nodes */}
        <div className="absolute inset-0 flex items-center justify-center gap-12">
          <MockNode
            type="input"
            label="Input"
            color="bg-gradient-to-r from-emerald-400 to-emerald-600"
            icon={FileInput}
            preview="1 field: text"
          />
          <div className="w-12 h-0.5 bg-gradient-to-r from-blue-500 to-violet-500" />
          <div className="relative">
            <MockNode
              type="ai"
              label="AI"
              color="bg-gradient-to-r from-violet-400 to-violet-600"
              icon={Sparkles}
              preview="Summarize text"
            />
            {/* Output handle - draggable connection point */}
            {step >= 1 && (
              <div
                draggable={step === 1}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                className={cn(
                  "absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-blue-500 border-2 border-background transition-all z-20",
                  step === 1 && "cursor-grab active:cursor-grabbing hover:scale-150 animate-pulse hover:bg-blue-400",
                  isDraggingConnection && "scale-150 bg-blue-400"
                )}
              />
            )}
          </div>

          {/* Drop zone indicator for Output node */}
          {step === 0 && (
            <div className="text-center text-muted-foreground border-2 border-dashed border-muted-foreground/30 rounded-xl p-6">
              <GripVertical className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Drop Output here</p>
            </div>
          )}

          {step === 2 && (
            <div className="w-12 h-0.5 bg-gradient-to-r from-violet-500 to-rose-500 animate-in slide-in-from-left duration-500" />
          )}

          {step >= 1 && (
            <div className="relative animate-in fade-in zoom-in duration-300">
              <MockNode
                type="output"
                label="Output"
                color="bg-gradient-to-r from-rose-400 to-rose-600"
                icon={FileOutput}
                selected={step === 1}
                preview={step === 2 ? "JSON format" : undefined}
              />
              {/* Input handle - drop target */}
              <div
                onDrop={handleDropOnTarget}
                onDragOver={handleDragOver}
                className={cn(
                  "absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-blue-500 border-2 border-background transition-all z-20",
                  isDraggingConnection && "scale-150 bg-green-500 animate-pulse"
                )}
              />
            </div>
          )}
        </div>
      </DropZone>

      {step === 0 && (
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-10">
          <AnimatedArrow direction="down" />
        </div>
      )}

      {step === 1 && (
        <div className="absolute right-[calc(50%-20px)] top-1/2 -translate-y-1/2 z-10">
          <AnimatedArrow direction="right" />
        </div>
      )}

      {step === 2 && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-green-500 text-white px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 animate-in fade-in zoom-in z-10">
          <Check className="h-4 w-4" />
          Your workflow is ready!
        </div>
      )}

      <MockDock highlightType={step === 0 ? "output" : undefined} />
    </div>
  );
}

function RunWorkflowStep({ phase }: { phase: number }) {
  const [running, setRunning] = useState(false);
  const [complete, setComplete] = useState(false);
  const [activeNode, setActiveNode] = useState<string | null>(null);

  const runWorkflow = () => {
    setRunning(true);
    setActiveNode("input");

    setTimeout(() => setActiveNode("ai"), 1000);
    setTimeout(() => setActiveNode("output"), 2000);
    setTimeout(() => {
      setActiveNode(null);
      setRunning(false);
      setComplete(true);
    }, 3000);
  };

  return (
    <div className="relative h-[500px]">
      {/* Mock Header */}
      <div className="h-14 border-b bg-card flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="font-medium">My First Workflow</span>
        </div>
        <div className="relative">
          <Button
            onClick={runWorkflow}
            disabled={running || complete}
            className="gap-2 bg-gradient-to-r from-blue-500 to-indigo-600"
          >
            {running ? (
              <>
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Running...
              </>
            ) : complete ? (
              <>
                <Check className="h-4 w-4" />
                Complete
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Run
              </>
            )}
          </Button>
          {!running && !complete && <PulsingDot className="absolute -top-1 -right-1" />}
        </div>
      </div>

      {/* Canvas */}
      <div className="h-[calc(100%-56px)] bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#374151_1px,transparent_1px)] [background-size:20px_20px] flex items-center justify-center gap-12">
        <div className={cn("transition-all duration-300", activeNode === "input" && "scale-110")}>
          <MockNode
            type="input"
            label="Input"
            color={cn(
              "bg-gradient-to-r from-emerald-400 to-emerald-600",
              activeNode === "input" && "ring-4 ring-emerald-400/50"
            )}
            icon={FileInput}
            preview="1 field: text"
          />
        </div>
        <div className={cn("w-12 h-0.5 bg-gradient-to-r from-blue-500 to-violet-500", activeNode === "ai" && "h-1")} />
        <div className={cn("transition-all duration-300", activeNode === "ai" && "scale-110")}>
          <MockNode
            type="ai"
            label="AI"
            color={cn(
              "bg-gradient-to-r from-violet-400 to-violet-600",
              activeNode === "ai" && "ring-4 ring-violet-400/50"
            )}
            icon={Sparkles}
            preview="Summarize text"
          />
        </div>
        <div className={cn("w-12 h-0.5 bg-gradient-to-r from-violet-500 to-rose-500", activeNode === "output" && "h-1")} />
        <div className={cn("transition-all duration-300", activeNode === "output" && "scale-110")}>
          <MockNode
            type="output"
            label="Output"
            color={cn(
              "bg-gradient-to-r from-rose-400 to-rose-600",
              activeNode === "output" && "ring-4 ring-rose-400/50"
            )}
            icon={FileOutput}
            preview="JSON format"
          />
        </div>
      </div>

      {/* Arrow pointing to Run button */}
      {!running && !complete && (
        <div className="absolute top-4 right-36">
          <AnimatedArrow direction="right" />
        </div>
      )}

      {/* Result overlay */}
      {complete && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-96 bg-card border rounded-xl shadow-xl p-4 animate-in slide-in-from-bottom duration-500">
          <div className="flex items-center gap-2 text-green-600 font-medium mb-3">
            <Check className="h-5 w-5" />
            Workflow executed successfully!
          </div>
          <div className="bg-muted rounded-lg p-3 font-mono text-xs">
            <span className="text-muted-foreground">Output:</span>
            <p className="mt-1">
              "The text has been summarized into a concise format highlighting the key points..."
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function CompleteStep({ showConfetti }: { showConfetti: boolean }) {
  return (
    <div className="relative h-[500px] flex flex-col items-center justify-center p-8 text-center overflow-hidden">
      {/* Confetti effect */}
      {showConfetti && (
        <div className="absolute inset-0 pointer-events-none">
          {Array.from({ length: 50 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 rounded-full animate-confetti"
              style={{
                left: `${Math.random() * 100}%`,
                backgroundColor: ["#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444"][
                  Math.floor(Math.random() * 5)
                ],
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${2 + Math.random() * 2}s`,
              }}
            />
          ))}
        </div>
      )}

      <div className="w-24 h-24 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center mb-8 shadow-xl animate-in zoom-in duration-500">
        <Check className="h-12 w-12 text-white" />
      </div>

      <h2 className="text-3xl font-bold mb-4">That's it. Seriously.</h2>
      <p className="text-muted-foreground max-w-md mb-8">
        You just built an AI workflow. No code. No config files.
        Now imagine what you could automate for real.
      </p>

      <div className="grid grid-cols-3 gap-4 mb-8 text-sm">
        <div className="p-4 rounded-xl bg-muted/50 border">
          <div className="w-10 h-10 rounded-lg bg-emerald-500 flex items-center justify-center text-white mx-auto mb-2">
            <FileInput className="h-5 w-5" />
          </div>
          <p className="font-medium">Drag</p>
          <p className="text-xs text-muted-foreground">Pick your nodes</p>
        </div>
        <div className="p-4 rounded-xl bg-muted/50 border">
          <div className="w-10 h-10 rounded-lg bg-violet-500 flex items-center justify-center text-white mx-auto mb-2">
            <Settings className="h-5 w-5" />
          </div>
          <p className="font-medium">Configure</p>
          <p className="text-xs text-muted-foreground">Set your logic</p>
        </div>
        <div className="p-4 rounded-xl bg-muted/50 border">
          <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center text-white mx-auto mb-2">
            <Play className="h-5 w-5" />
          </div>
          <p className="font-medium">Run</p>
          <p className="text-xs text-muted-foreground">Ship it</p>
        </div>
      </div>

      <Button asChild size="lg" className="gap-2 bg-gradient-to-r from-blue-500 to-indigo-600">
        <Link href="/workflow">
          <Rocket className="h-5 w-5" />
          Build Your First Workflow
        </Link>
      </Button>
    </div>
  );
}
