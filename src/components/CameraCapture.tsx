import React, { useState, useRef, useEffect, useCallback } from "react";
import { Camera, RefreshCw, Upload, Sparkles, AlertCircle, ShieldAlert, Image as ImageIcon, Video, Grid, Maximize2, FileSpreadsheet } from "lucide-react";

interface CameraCaptureProps {
  onCapture: (imageDataUrl: string) => void;
  isLoading: boolean;
  onSelectPreset: (presetName: string) => void;
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({
  onCapture,
  isLoading,
  onSelectPreset,
}) => {
  const [activeTab, setActiveTab] = useState<"camera" | "upload">("upload");
  const [framingMode, setFramingMode] = useState<"full-page" | "column">("full-page");
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCameraPermissionDenied(false);
    stopCamera();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError("Web camera is not supported on this browser or platform.");
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: facingMode,
          // Request high resolution for full-page measurement chart scanning
          width: { ideal: 3840, min: 1920 },
          height: { ideal: 2160, min: 1080 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch((err) => {
          console.warn("Video play notice:", err);
        });
      }
      setCameraActive(true);
      setActiveTab("camera");
    } catch (err: any) {
      const errName = err?.name || "";
      const errMsg = err?.message || "";
      const isDenied =
        errName === "NotAllowedError" ||
        errName === "PermissionDeniedError" ||
        errMsg.toLowerCase().includes("permission denied") ||
        errMsg.toLowerCase().includes("not allowed");

      if (isDenied) {
        console.warn("Camera permission prompt was dismissed or denied by the browser.");
        setCameraPermissionDenied(true);
        setCameraError("Camera permission was denied. You can enable camera in your browser settings or upload a photo directly.");
      } else {
        console.warn("Camera device initialization note:", errMsg);
        setCameraError(`Could not start camera: ${errMsg || "Device unavailable"}`);
      }
      setCameraActive(false);
    }
  }, [facingMode, stopCamera]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const toggleCameraFacing = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    onCapture(dataUrl);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          onCapture(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          onCapture(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
      {/* Top Header Bar */}
      <div className="p-3.5 bg-slate-50 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        {/* Input Method Switcher */}
        <div className="flex items-center gap-1 bg-slate-200/70 dark:bg-slate-800 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => {
              setActiveTab("upload");
              stopCamera();
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === "upload"
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Upload className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Upload / Drag & Drop</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("camera");
              if (!cameraActive) {
                startCamera();
              }
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === "camera"
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Camera className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Live Camera</span>
            {cameraActive && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </button>
        </div>

        {/* Framing Guide Mode (Camera active) */}
        {activeTab === "camera" && cameraActive && (
          <div className="flex items-center gap-1 bg-slate-200/70 dark:bg-slate-800 p-1 rounded-xl text-xs">
            <button
              type="button"
              onClick={() => setFramingMode("full-page")}
              className={`px-2.5 py-1 rounded-lg font-medium inline-flex items-center gap-1 transition-all cursor-pointer ${
                framingMode === "full-page"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
            >
              <Maximize2 className="w-3 h-3" />
              <span>Full Page Chart</span>
            </button>
            <button
              type="button"
              onClick={() => setFramingMode("column")}
              className={`px-2.5 py-1 rounded-lg font-medium inline-flex items-center gap-1 transition-all cursor-pointer ${
                framingMode === "column"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
            >
              <Grid className="w-3 h-3" />
              <span>Column Strip</span>
            </button>
          </div>
        )}

        {/* Quick Test Presets */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-slate-500 dark:text-slate-400 font-medium">Quick Presets:</span>
          <button
            type="button"
            onClick={() => onSelectPreset("tannery-chart-fullpage")}
            className="px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/70 font-semibold transition-colors border border-emerald-300 dark:border-emerald-800 cursor-pointer flex items-center gap-1.5 shadow-xs"
            title="Everwin Tanners 8-column measurement sheet (214 hides, 4475 Sq. Ft.)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Tannery Chart (Full Page)</span>
            <span className="text-[10px] px-1 py-0.2 rounded bg-emerald-200/80 dark:bg-emerald-800/80 text-emerald-950 dark:text-emerald-100 font-bold">214 hides</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectPreset("multi-vertical-lines")}
            className="px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 font-medium transition-colors border border-indigo-200 dark:border-indigo-800 cursor-pointer flex items-center gap-1"
          >
            <span>2 Columns</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectPreset("example-33-32")}
            className="px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 font-medium transition-colors border border-blue-200 dark:border-blue-800 cursor-pointer"
          >
            33.3 + 32.2
          </button>
        </div>
      </div>

      {/* Main Viewfinder / Upload Dropzone */}
      <div
        className={`relative w-full aspect-4/3 sm:aspect-16/10 bg-slate-900 dark:bg-slate-950 flex items-center justify-center overflow-hidden ${
          isDragOver ? "ring-4 ring-blue-500 bg-slate-800 dark:bg-slate-900" : ""
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        {/* Live Video Stream */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`w-full h-full object-cover ${activeTab === "camera" && cameraActive ? "block" : "hidden"}`}
        />

        {/* Framing Guides when camera active */}
        {activeTab === "camera" && cameraActive && !isLoading && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-3 sm:p-5">
            {framingMode === "full-page" ? (
              // Full Page Measurement Chart Framing Overlay
              <div className="w-[92%] h-[92%] border-2 border-emerald-400/90 rounded-2xl relative shadow-2xl flex flex-col justify-between p-3 bg-black/15 backdrop-blur-[0.5px]">
                {/* 4 Corner Crosshairs */}
                <div className="absolute -top-1.5 -left-1.5 w-6 h-6 border-t-4 border-l-4 border-emerald-400" />
                <div className="absolute -top-1.5 -right-1.5 w-6 h-6 border-t-4 border-r-4 border-emerald-400" />
                <div className="absolute -bottom-1.5 -left-1.5 w-6 h-6 border-b-4 border-l-4 border-emerald-400" />
                <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 border-b-4 border-r-4 border-emerald-400" />

                {/* Top Document Header Zone */}
                <div className="flex justify-between items-center text-white text-[11px] font-sans">
                  <span className="bg-emerald-600/90 text-white font-bold px-2.5 py-1 rounded-md shadow-xs flex items-center gap-1.5">
                    <Maximize2 className="w-3 h-3" />
                    FULL PAGE MEASUREMENT CHART
                  </span>
                  <span className="bg-black/70 px-2.5 py-1 rounded-md text-emerald-300 font-mono text-[10px]">
                    Rows 1 – 30 • 8 Columns
                  </span>
                </div>

                {/* Center Grid Visualizer */}
                <div className="w-full flex-1 flex flex-col justify-center my-2 opacity-40">
                  <div className="w-full border-t border-dashed border-emerald-300/40 my-auto" />
                  <div className="w-full border-t border-dashed border-emerald-300/40 my-auto" />
                  <div className="w-full border-t border-dashed border-emerald-300/40 my-auto" />
                </div>

                <div className="text-center text-white text-xs font-semibold bg-black/75 px-4 py-1.5 rounded-xl self-center border border-emerald-500/40 shadow-lg">
                  Hold camera parallel to paper • Capture all rows from top header to bottom footer
                </div>

                {/* Bottom Footer Summary Zone */}
                <div className="flex justify-between items-center text-white text-[11px] font-sans">
                  <span className="bg-black/70 px-2.5 py-1 rounded-md text-slate-300 font-mono text-[10px]">
                    Tannery Shorthand: 25- = 25.0 Sq&apos; Ft
                  </span>
                  <span className="bg-emerald-600/90 text-white font-bold px-2.5 py-1 rounded-md shadow-xs">
                    Auto Column &amp; Grand Total
                  </span>
                </div>
              </div>
            ) : (
              // Single / Multi Column Narrow Strip Framing Overlay
              <div className="w-56 sm:w-72 h-4/5 border-2 border-dashed border-white/70 rounded-xl relative shadow-2xl flex flex-col justify-between p-3 bg-black/10 backdrop-blur-[1px]">
                <div className="flex justify-between items-center text-white/90 text-xs font-mono">
                  <span className="bg-black/60 px-2 py-0.5 rounded">TOP VALUE</span>
                  <span className="bg-blue-500/80 px-2 py-0.5 rounded text-white font-sans font-medium">Vertical Alignment</span>
                </div>
                <div className="text-center text-white/80 text-xs font-medium bg-black/60 px-2 py-1 rounded backdrop-blur-sm self-center">
                  Center vertical numbers here
                </div>
                <div className="flex justify-between items-center text-white/90 text-xs font-mono">
                  <span className="bg-black/60 px-2 py-0.5 rounded">+ NEXT VALUES</span>
                  <span className="bg-emerald-500/80 px-2 py-0.5 rounded text-white font-sans font-medium">Auto Sum</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Upload Mode View */}
        {activeTab === "upload" && (
          <div className="text-center p-6 max-w-md">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-emerald-600/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400 hover:bg-emerald-600/30 transition-colors cursor-pointer"
            >
              <Upload className="w-8 h-8" />
            </div>

            <h3 className="text-white text-base font-semibold mb-1">
              Upload or Snap Photo of Measurement Chart
            </h3>
            <p className="text-slate-300 text-xs mb-5 max-w-xs mx-auto">
              Supports full-page measurement charts (e.g. Everwin Tanners), multi-column ledgers, and vertical addition columns.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors shadow-sm"
              >
                <ImageIcon className="w-4 h-4" />
                Select Photo from Device
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab("camera");
                  startCamera();
                }}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium inline-flex items-center gap-2 border border-slate-700 cursor-pointer transition-colors"
              >
                <Video className="w-4 h-4 text-emerald-400" />
                Use Web Camera
              </button>
            </div>

            {/* Helper chip */}
            <div className="mt-5 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700 text-[11px] text-slate-300">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>Full-page measurement charts &amp; tannery sheets supported</span>
            </div>
          </div>
        )}

        {/* Camera Inactive or Permission Denied State */}
        {activeTab === "camera" && !cameraActive && (
          <div className="text-center p-6 max-w-md">
            {cameraPermissionDenied ? (
              <div className="mb-4 text-left p-4 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200">
                <div className="flex items-center gap-2 font-semibold text-xs mb-1 text-amber-300">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>Camera Access Blocked</span>
                </div>
                <p className="text-[11px] text-amber-200/90 leading-relaxed mb-3">
                  Camera permission was denied or restricted in your browser. To enable it, click the lock or camera icon in the browser address bar and choose &quot;Allow&quot;.
                </p>
                <p className="text-[11px] text-amber-300/80 font-medium">
                  Alternatively, you can upload any photo or use your mobile device&apos;s native camera below:
                </p>
              </div>
            ) : cameraError ? (
              <div className="mb-4 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500/20 text-rose-200 text-xs border border-rose-500/30">
                <AlertCircle className="w-4 h-4 text-rose-300 shrink-0" />
                <span>{cameraError}</span>
              </div>
            ) : null}

            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/10 flex items-center justify-center text-white/80">
              <Camera className="w-8 h-8" />
            </div>

            <h3 className="text-white text-base font-semibold mb-1">Live Camera Scanner</h3>
            <p className="text-slate-300 text-xs mb-4">
              Position your phone or webcam over the measurement chart or vertical column.
            </p>

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={startCamera}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer shadow-sm transition-colors"
              >
                <Video className="w-4 h-4" />
                Start Camera
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium inline-flex items-center gap-2 border border-slate-700 cursor-pointer transition-colors"
              >
                <Upload className="w-4 h-4 text-slate-400" />
                Upload Photo Instead
              </button>
            </div>
          </div>
        )}

        {/* Analyzing Overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 z-20">
            <div className="relative mb-4">
              <div className="w-16 h-16 rounded-full border-4 border-emerald-500/30 border-t-emerald-500 animate-spin" />
              <Sparkles className="w-6 h-6 text-emerald-400 absolute inset-0 m-auto animate-pulse" />
            </div>
            <h4 className="text-white font-semibold text-base mb-1">
              Analyzing Full Page Measurement Chart...
            </h4>
            <p className="text-xs text-slate-300 text-center max-w-xs">
              Detecting vertical columns, parsing shorthand measurements, and computing exact column and grand totals.
            </p>
          </div>
        )}
      </div>

      {/* Hidden File Input for Image Upload / Native Mobile Camera */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Bottom Shutter & Action Bar */}
      <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {activeTab === "camera" && cameraActive && (
            <button
              type="button"
              onClick={toggleCameraFacing}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Switch camera"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Upload className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span>Choose File</span>
          </button>
        </div>

        {/* Primary Action Button */}
        {activeTab === "camera" && cameraActive ? (
          <button
            type="button"
            onClick={capturePhoto}
            disabled={isLoading}
            className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer shadow-md shadow-emerald-500/20 transition-all"
          >
            <Camera className="w-4 h-4" />
            <span>Capture Full Page &amp; Calculate</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer shadow-md shadow-emerald-500/20 transition-all"
          >
            <Upload className="w-4 h-4" />
            <span>Select Photo to Calculate</span>
          </button>
        )}

        <div className="text-xs text-slate-400 dark:text-slate-500 font-mono hidden sm:block">
          Full Page OCR Active
        </div>
      </div>
    </div>
  );
};
