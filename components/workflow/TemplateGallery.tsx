"use client";

import * as React from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useWorkflowStore } from "@/store/workflow";
import { useToast } from "@/hooks/use-toast";
import { templatesByCategory, type WorkflowTemplate } from "@/lib/templates";

/**
 * Pick a ready-made workflow instead of starting from an empty canvas.
 *
 * Templates load through the same `createWorkflow` path the AI assistant uses,
 * so a template lands on the canvas as an ordinary editable workflow rather than
 * a special locked-down thing.
 */

interface TemplateGalleryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TemplateGallery({ open, onOpenChange }: TemplateGalleryProps) {
  const { createWorkflow, nodes } = useWorkflowStore();
  const { toast } = useToast();
  const grouped = templatesByCategory();

  const use = (template: WorkflowTemplate) => {
    // Loading a template replaces the canvas, so don't silently discard work.
    if (nodes.length > 0) {
      const proceed = window.confirm(
        "This will replace what's on your canvas. Continue?"
      );
      if (!proceed) return;
    }

    createWorkflow(template.workflow);
    onOpenChange(false);

    toast({
      title: template.name,
      description: "Loaded onto your canvas. Press Run when you're ready.",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="fy-display text-2xl">
            Start from a template
          </DialogTitle>
          <DialogDescription>
            Each of these works straight away, no accounts to connect. You can
            change anything afterwards.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {grouped.map(([category, templates]) => (
            <div key={category}>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                {category}
              </p>

              <div className="space-y-2">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => use(template)}
                    className="w-full text-left p-4 rounded-2xl border bg-card hover:border-[var(--fy-blue)] hover:shadow-[0_16px_40px_-28px_rgba(0,61,176,0.45)] transition-all group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-md bg-gradient-to-br from-[var(--fy-blue)] to-[var(--fy-blue-deep)] flex items-center justify-center shrink-0">
                        <Sparkles className="h-4 w-4 text-white" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{template.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {template.description}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-1.5">
                          You&apos;ll need: {template.needs}
                        </p>
                      </div>

                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Opens the gallery. Used from the empty canvas. */
export function TemplateGalleryTrigger() {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)} className="fy-pill gap-2">
        <Sparkles className="h-4 w-4" />
        Start from a template
      </Button>
      <TemplateGallery open={open} onOpenChange={setOpen} />
    </>
  );
}
