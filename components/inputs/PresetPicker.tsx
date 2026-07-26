"use client";

import * as React from "react";
import { Wand2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  API_PRESETS,
  applyPreset,
  presetsByCategory,
  type ApiPreset,
} from "@/lib/api-presets";

/**
 * "Set this up for me" for the API step.
 *
 * Picking a preset fills in the URL, method, headers, and body shape, leaving the
 * user one field: their own key or webhook URL. Everything it writes is ordinary
 * API-step config, so it stays fully editable afterwards.
 */

interface PresetPickerProps {
  onApply: (config: Record<string, unknown>) => void;
}

export function PresetPicker({ onApply }: PresetPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<ApiPreset | null>(null);
  const [value, setValue] = React.useState("");

  const close = () => {
    setOpen(false);
    setSelected(null);
    setValue("");
  };

  const confirm = () => {
    if (!selected || !value.trim()) return;
    onApply(applyPreset(selected, value.trim()));
    close();
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 w-full"
        onClick={() => setOpen(true)}
      >
        <Wand2 className="h-3.5 w-3.5" />
        Set this up for me
      </Button>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {selected === null ? (
            <>
              <DialogHeader>
                <DialogTitle>What should this step do?</DialogTitle>
                <DialogDescription>
                  Pick one and we&apos;ll fill in the technical details. You only
                  need your own key or link.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5 py-2">
                {presetsByCategory().map(([category, presets]) => (
                  <div key={category}>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                      {category}
                    </p>
                    <div className="space-y-2">
                      {presets.map((preset) => (
                        <button
                          key={preset.id}
                          onClick={() => setSelected(preset)}
                          className="w-full text-left p-3 rounded-lg border hover:border-primary hover:bg-accent transition-colors"
                        >
                          <p className="font-medium text-sm">{preset.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {preset.description}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{selected.name}</DialogTitle>
                <DialogDescription>{selected.description}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div>
                  <Label htmlFor="preset-secret">{selected.secret.label}</Label>
                  <p className="text-xs text-muted-foreground mt-1 mb-2">
                    {selected.secret.help}
                  </p>
                  <Input
                    id="preset-secret"
                    value={value}
                    placeholder={selected.secret.placeholder}
                    onChange={(e) => setValue(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="rounded-lg border bg-muted/40 p-3">
                  <p className="text-xs font-medium mb-1 flex items-center gap-1.5">
                    <ExternalLink className="h-3 w-3" />
                    Where to find it
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selected.whereToGetIt}
                  </p>
                </div>

                <p className="text-xs text-muted-foreground">
                  We&apos;ll fill in the rest. You can change any of it afterwards
                  — some presets have a placeholder you&apos;ll want to replace,
                  like a database ID.
                </p>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setSelected(null)}>
                  Back
                </Button>
                <Button onClick={confirm} disabled={!value.trim()}>
                  Set it up
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export { API_PRESETS };
