"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type MediaKind = "image" | "video" | "logo";

type MediaFile = {
  key: string;
  url: string;
  size: number;
  updatedAt: string;
};

const getMediaKindFromFile = (file: File): MediaKind => {
  if (file.type.startsWith("video/")) return "video";
  if (file.name.toLowerCase().includes("logo")) return "logo";
  return "image";
};

const isImageUrl = (key: string): boolean =>
  /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(key);

const isVideoUrl = (key: string): boolean =>
  /\.(mp4|webm|mov|avi)$/i.test(key);

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const MediaManager = () => {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = useCallback(async () => {
    const response = await fetch("/api/media/files");
    if (!response.ok) {
      setStatus("Kunne ikke hente filer");
      return;
    }
    const data = (await response.json()) as { files: MediaFile[] };
    setFiles(data.files);
  }, []);

  useEffect(() => {
    const load = setTimeout(() => void fetchFiles(), 0);
    return () => clearTimeout(load);
  }, [fetchFiles]);

  const uploadFile = async (file: File) => {
    setUploading(true);
    setStatus("Laster opp fil...");
    const mediaKind = getMediaKindFromFile(file);
    const payload = new FormData();
    payload.append("file", file);
    payload.append("mediaKind", mediaKind);

    const response = await fetch("/api/media/upload", {
      method: "POST",
      body: payload,
    });

    if (!response.ok) {
      setStatus("Opplasting feilet");
      setUploading(false);
      return;
    }

    setStatus("Opplasting fullført");
    setUploading(false);
    await fetchFiles();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    await uploadFile(selected);
    event.target.value = "";
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (!file) return;
    await uploadFile(file);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  const triggerFilePicker = () => {
    if (!uploading) {
      fileInputRef.current?.click();
    }
  };

  const deleteFile = async (key: string) => {
    setStatus("Sletter fil...");
    const response = await fetch("/api/media/files", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    if (!response.ok) {
      setStatus("Kunne ikke slette fil");
      return;
    }
    setStatus("Fil slettet");
    await fetchFiles();
  };

  return (
    <div className="space-y-6">
      <div
        onDrop={(e) => void handleDrop(e)}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={triggerFilePicker}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            triggerFilePicker();
          }
        }}
        role="button"
        tabIndex={0}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors",
          dragging
            ? "border-primary bg-primary/5"
            : "border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50",
        )}
      >
        <div className="text-3xl text-muted-foreground">+</div>
        <p className="mt-2 text-sm font-medium text-foreground">
          {uploading ? "Laster opp..." : "Dra filer hit eller klikk for å laste opp"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Bilder, videoer og logoer (maks 50 MB)
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          onChange={(e) => void handleFileChange(e)}
          disabled={uploading}
          className="hidden"
        />
      </div>

      {status ? (
        <p className="text-sm text-muted-foreground">{status}</p>
      ) : null}

      {files.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Ingen filer lastet opp enda.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {files.map((file) => (
            <div
              key={file.key}
              className="group relative overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="aspect-square bg-muted/30">
                {isImageUrl(file.key) ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={file.url}
                    alt={file.key.split("/").pop() ?? "Fil"}
                    className="size-full object-cover"
                  />
                ) : isVideoUrl(file.key) ? (
                  <div className="flex size-full items-center justify-center">
                    <span className="text-3xl text-muted-foreground">&#9654;</span>
                  </div>
                ) : (
                  <div className="flex size-full items-center justify-center">
                    <span className="text-2xl text-muted-foreground">&#128196;</span>
                  </div>
                )}
              </div>

              <div className="p-3">
                <p className="truncate text-xs font-medium text-foreground">
                  {file.key.split("/").pop()}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {formatBytes(file.size)}
                </p>
              </div>

              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                <a
                  href={file.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded bg-white/20 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm hover:bg-white/30"
                >
                  Åpne
                </a>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void deleteFile(file.key)}
                  className="h-6 px-2 text-[10px]"
                >
                  Slett
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
