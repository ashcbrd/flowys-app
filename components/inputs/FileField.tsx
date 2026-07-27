"use client";

import * as React from "react";
import { Upload, FileText, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Upload a document and hand its text to the workflow.
 *
 * The file is read in the browser and only its text is passed along, nothing is
 * uploaded to a server and nothing is stored. That keeps this a real feature with
 * no infrastructure behind it, and means the AI steps downstream receive a
 * plain string exactly as if the text had been pasted in.
 *
 * Text-based documents only for now. PDFs and images need a parser that isn't in
 * the project yet, so they are refused with an explanation instead of failing
 * silently at run time.
 */

const TEXT_EXTENSIONS = [
  ".txt",
  ".csv",
  ".tsv",
  ".md",
  ".markdown",
  ".json",
  ".log",
  ".xml",
  ".yaml",
  ".yml",
  ".html",
  ".eml",
];

/** 2 MB, comfortably more than any pasted-text equivalent, small enough to stay snappy. */
const MAX_BYTES = 2 * 1024 * 1024;

function isReadable(file: File): boolean {
  if (file.type.startsWith("text/")) return true;
  if (file.type === "application/json") return true;
  const name = file.name.toLowerCase();
  return TEXT_EXTENSIONS.some((ext) => name.endsWith(ext));
}

interface FileFieldProps {
  /** The extracted text. */
  value: string;
  onChange: (text: string) => void;
  id?: string;
  className?: string;
}

export function FileField({ value, onChange, id, className }: FileFieldProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [reading, setReading] = React.useState(false);

  const handleFile = async (file: File) => {
    setError(null);

    if (!isReadable(file)) {
      setError(
        "We can read text documents: .txt, .csv, .md, .json and similar. PDFs and images aren't supported yet; copy the text in instead."
      );
      return;
    }

    if (file.size > MAX_BYTES) {
      setError("That file is over 2 MB. Try a smaller one, or paste the part you need.");
      return;
    }

    setReading(true);
    try {
      const text = await file.text();
      setFileName(file.name);
      onChange(text);
    } catch {
      setError("We couldn't read that file. Try saving it as plain text.");
    } finally {
      setReading(false);
    }
  };

  const clear = () => {
    setFileName(null);
    setError(null);
    onChange("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const hasContent = Boolean(value);

  return (
    <div className={cn("space-y-2", className)}>
      <input
        ref={inputRef}
        id={id}
        type="file"
        className="hidden"
        accept={TEXT_EXTENSIONS.join(",")}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      {hasContent ? (
        <div className="flex items-center gap-2 rounded-md border p-2.5">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate">{fileName || "Pasted text"}</p>
            <p className="text-xs text-muted-foreground">
              {value.length.toLocaleString()} characters read
            </p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            onClick={clear}
            aria-label="Remove file"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
          disabled={reading}
          className={cn(
            "w-full rounded-md border border-dashed p-4",
            "flex flex-col items-center gap-1.5 text-center",
            "hover:border-primary hover:bg-accent transition-colors",
            "disabled:opacity-50"
          )}
        >
          {reading ? (
            <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
          ) : (
            <Upload className="h-5 w-5 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">
            {reading ? "Reading…" : "Choose a file or drop one here"}
          </span>
          <span className="text-xs text-muted-foreground">
            Text documents: .txt, .csv, .md, .json
          </span>
        </button>
      )}

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
