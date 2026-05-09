"use client";

import * as React from "react";
import { Camera, CameraOff, RefreshCw, UploadCloud } from "lucide-react";

import CrystalBallLoader from "@/components/CrystalBallLoader";
import { useMysticTheme } from "@/components/MysticThemeProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { PalmReading } from "@/lib/types";

const API_BASE = "http://localhost:8000";

type InputMode = "camera" | "upload";

export default function PalmScanner({ onReading }: { onReading: (reading: PalmReading) => void }) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const [mode, setMode] = React.useState<InputMode>("camera");
  const [stream, setStream] = React.useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = React.useState("");
  const [captured, setCaptured] = React.useState("");

  const [previewUrl, setPreviewUrl] = React.useState("");
  const [reading, setReading] = React.useState<PalmReading | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const { setElement, setCursed } = useMysticTheme();

  // Start camera stream
  async function startCamera() {
    setCameraError("");
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      setStream(s);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
      }
    } catch {
      setCameraError("Camera access denied or unavailable. Use photo upload instead.");
    }
  }

  // Stop and release stream
  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
  }

  // Attach stream to video element when both are ready
  React.useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Start camera when mode switches to camera
  React.useEffect(() => {
    if (mode === "camera") {
      void startCamera();
    } else {
      stopCamera();
      setCaptured("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function captureFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setCaptured(dataUrl);
    setPreviewUrl(dataUrl);
    stopCamera();
    void submitBase64(dataUrl);
  }

  function retake() {
    setCaptured("");
    setPreviewUrl("");
    setReading(null);
    setError("");
    void startCamera();
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const dataUrl = await fileToBase64(file);
    setPreviewUrl(dataUrl);
    void submitBase64(dataUrl);
  }

  async function submitBase64(dataUrl: string) {
    setError("");
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/palm/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: dataUrl }),
      });
      if (!response.ok) throw new Error(await response.text());
      const data = (await response.json()) as PalmReading;
      setReading(data);
      setElement(data.dominant_element);
      setCursed(Boolean(data.is_cursed));
      onReading(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Palm reading failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 1: Palm Scanner</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Mode toggle */}
        <div className="flex gap-2">
          <Button
            type="button"
            variant={mode === "camera" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("camera")}
          >
            <Camera className="h-4 w-4" />
            Camera
          </Button>
          <Button
            type="button"
            variant={mode === "upload" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("upload")}
          >
            <UploadCloud className="h-4 w-4" />
            Upload
          </Button>
        </div>

        {/* Camera mode */}
        {mode === "camera" && (
          <div className="space-y-3">
            {cameraError ? (
              <p className="rounded-md border border-yellow-500/50 bg-yellow-950/30 p-3 text-sm text-yellow-100">
                <CameraOff className="mb-1 inline h-4 w-4" /> {cameraError}
              </p>
            ) : captured ? (
              <div className="space-y-3">
                <img
                  src={captured}
                  alt="Captured palm"
                  className="max-h-64 w-full rounded-md object-contain shadow-2xl"
                />
                <Button type="button" variant="outline" size="sm" onClick={retake}>
                  <RefreshCw className="h-4 w-4" />
                  Retake
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative overflow-hidden rounded-lg border border-primary/40 bg-black">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full"
                    style={{ maxHeight: 320 }}
                  />
                  {!stream && (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                      Starting camera…
                    </div>
                  )}
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  Hold your open palm flat toward the camera, then capture.
                </p>
                <Button
                  type="button"
                  className="w-full"
                  onClick={captureFrame}
                  disabled={!stream}
                >
                  <Camera className="h-4 w-4" />
                  Capture Palm
                </Button>
              </div>
            )}
            {/* Hidden canvas for frame capture */}
            <canvas ref={canvasRef} className="hidden" />
          </div>
        )}

        {/* Upload mode */}
        {mode === "upload" && (
          <div className="space-y-3">
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
              }}
              onDrop={(e) => {
                e.preventDefault();
                void handleFile(e.dataTransfer.files?.[0]);
              }}
              onDragOver={(e) => e.preventDefault()}
              className="flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-primary/50 bg-background/45 p-6 text-center transition hover:bg-accent/30"
            >
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Uploaded palm preview"
                  className="max-h-48 rounded-md object-contain shadow-2xl"
                />
              ) : (
                <>
                  <UploadCloud className="h-12 w-12 text-primary" />
                  <p className="mt-4 font-serif text-xl font-bold">Drop a palm photo</p>
                  <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                    PNG, JPEG, or WebP. Use a clear image of an open palm.
                  </p>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void handleFile(e.target.files?.[0])}
              />
            </div>
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
              <UploadCloud className="h-4 w-4" />
              Choose Image
            </Button>
          </div>
        )}

        {loading ? <CrystalBallLoader label="Reading the palm lines" /> : null}
        {error ? (
          <p className="rounded-md border border-red-500/50 bg-red-950/30 p-3 text-sm text-red-100">
            {error}
          </p>
        ) : null}

        {reading ? (
          <div className="space-y-4">
            {reading.is_cursed ? (
              <div className="cursed-banner rounded-md px-4 py-3 text-sm font-bold uppercase tracking-[0.18em]">
                Your palm bears a dark mark
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <Badge>{reading.dominant_element}</Badge>
              <span className="text-sm text-muted-foreground">
                Image quality: {reading.image_quality}
              </span>
            </div>
            <div>
              <div className="mb-2 flex justify-between text-sm">
                <span>Destiny score</span>
                <span className="font-bold text-primary">{reading.destiny_score}/100</span>
              </div>
              <Progress value={reading.destiny_score} />
            </div>
            <div className="grid gap-3 text-sm">
              <HighlightList title="Themes" values={reading.reading.themes} />
              <HighlightList title="Strengths" values={reading.reading.strengths} />
              <HighlightList title="Cautions" values={reading.reading.cautions} />
            </div>
            <p className="text-xs leading-5 text-muted-foreground">{reading.safety_disclaimer}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function HighlightList({ title, values }: { title: string; values: string[] }) {
  return (
    <div className="rounded-md border border-border bg-background/35 p-3">
      <p className="mb-2 font-semibold text-primary">{title}</p>
      <ul className="space-y-1 text-muted-foreground">
        {values.slice(0, 4).map((value) => (
          <li key={value}>- {value}</li>
        ))}
      </ul>
    </div>
  );
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
