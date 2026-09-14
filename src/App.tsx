import React, { useState, useEffect, useCallback } from "react";
import { CameraCapture } from "./components/CameraCapture";
import { VerticalSumDisplay } from "./components/VerticalSumDisplay";
import { PhotoViewerWithBoxes } from "./components/PhotoViewerWithBoxes";
import { CalculationHistory } from "./components/CalculationHistory";
import { DetectedNumberItem, HistoryRecord, CalculationResult, VerticalColumnLine, MeasurementMetadata } from "./types";
import {
  computeSafeSum,
  generateSampleCanvasImage,
  generateMultiColumnCanvasImage,
  generateTanneryMeasurementChartCanvasImage,
} from "./utils/math";
import { shareCalculation } from "./utils/share";
import { exportToPdf, exportToExcel, formatCurrentDateTime } from "./utils/export";
import { PWAInstallButton } from "./components/PWAInstallButton";
import { OfflineIndicator } from "./components/OfflineIndicator";
import {
  Calculator,
  Camera,
  Sparkles,
  AlertCircle,
  Volume2,
  VolumeX,
  CheckCircle,
  RotateCw,
  Share2,
  Check,
  Moon,
  Sun,
  FileText,
  FileSpreadsheet,
  Calendar,
} from "lucide-react";

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("photo_calc_theme");
      if (stored) return stored === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });

  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [lastAttemptedImage, setLastAttemptedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<DetectedNumberItem[]>([]);
  const [columns, setColumns] = useState<VerticalColumnLine[]>([]);
  const [grandTotal, setGrandTotal] = useState<number | undefined>(undefined);
  const [grandFormula, setGrandFormula] = useState<string | undefined>(undefined);
  const [sum, setSum] = useState<number>(0);
  const [maxDecimals, setMaxDecimals] = useState<number>(0);
  const [detectedTitle, setDetectedTitle] = useState<string>("Vertical Column Addition");
  const [notes, setNotes] = useState<string>("");
  const [existingWrittenSum, setExistingWrittenSum] = useState<number | null | undefined>(null);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [calculationDate, setCalculationDate] = useState<number>(() => Date.now());
  const [measurementMetadata, setMeasurementMetadata] = useState<MeasurementMetadata | undefined>(undefined);
  const [isMeasurementChart, setIsMeasurementChart] = useState<boolean>(false);

  // Synchronize dark mode class to <html> element
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      try {
        localStorage.setItem("photo_calc_theme", "dark");
      } catch {}
    } else {
      document.documentElement.classList.remove("dark");
      try {
        localStorage.setItem("photo_calc_theme", "light");
      } catch {}
    }
  }, [isDarkMode]);

  // Listen to OS prefers-color-scheme changes if user hasn't explicitly set preference
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem("photo_calc_theme")) {
        setIsDarkMode(e.matches);
      }
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // Load history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("photo_calc_history");
      if (saved) {
        setHistory(JSON.parse(saved));
      }
    } catch (e) {
      console.warn("Could not read history from localStorage", e);
    }
  }, []);

  // Save history to localStorage
  const saveToHistory = useCallback((record: HistoryRecord) => {
    setHistory((prev) => {
      const updated = [record, ...prev.filter((r) => r.id !== record.id)].slice(0, 15);
      try {
        localStorage.setItem("photo_calc_history", JSON.stringify(updated));
      } catch (e) {
        console.warn("Could not write history to localStorage", e);
      }
      return updated;
    });
  }, []);

  // Play gentle completion sound
  const playChime = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch {
      // Audio context might be restricted before gesture
    }
  }, [soundEnabled]);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  };

  // Main photo processing pipeline
  const processImage = async (imageDataUrl: string, titleHint = "Scanned Note", presetName?: string) => {
    setIsLoading(true);
    setError(null);
    setLastAttemptedImage(imageDataUrl);
    const scanTimestamp = Date.now();
    setCalculationDate(scanTimestamp);

    try {
      const response = await fetch("/api/calculate-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: imageDataUrl,
          mimeType: "image/jpeg",
          preset: presetName,
        }),
      });

      const data: CalculationResult = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to recognize vertical numbers from this image.");
      }

      setCurrentImage(imageDataUrl);
      setDetectedTitle(data.detectedTitle || titleHint);
      setNotes(data.notes || "");
      setExistingWrittenSum(data.existingWrittenSum);

      const isChart = Boolean(data.isMeasurementChart || data.measurementMetadata);
      setIsMeasurementChart(isChart);
      setMeasurementMetadata(data.measurementMetadata);

      const isMulti = Array.isArray(data.columns) && data.columns.length > 1;

      if (isMulti && data.columns) {
        // Multi vertical column calculation
        setColumns(data.columns);
        const allItems = data.columns.flatMap((c) => c.items);
        setItems(allItems);
        setGrandTotal(data.grandTotal);
        setGrandFormula(data.grandFormula);
        setSum(data.grandTotal ?? computeSafeSum(data.columns.map((c) => c.sum)).sum);
      } else {
        // Single column calculation
        setColumns([]);
        setGrandTotal(undefined);
        setGrandFormula(undefined);
        const detectedItems = data.items || [];
        setItems(detectedItems);

        const calculatedSum = computeSafeSum(detectedItems).sum;
        setSum(calculatedSum);
        setMaxDecimals(data.maxDecimals || 1);
      }

      // Record to calculation history with timestamp
      const totalSum = data.grandTotal ?? data.sum ?? 0;
      saveToHistory({
        id: `rec-${scanTimestamp}`,
        timestamp: scanTimestamp,
        thumbnail: imageDataUrl,
        title: data.detectedTitle || titleHint,
        sum: totalSum,
        items: data.items || (data.columns ? data.columns.flatMap((c) => c.items) : []),
        columns: data.columns,
        grandTotal: data.grandTotal,
        notes: data.notes || "",
        measurementMetadata: data.measurementMetadata,
        isMeasurementChart: isChart,
      });

      playChime();
    } catch (err: any) {
      console.error("Calculation error:", err);
      setError(
        err.message ||
          "Could not analyze numbers in photo. Please ensure numbers are visible, or try one of the quick presets below."
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Preset demo loaders
  const handleSelectPreset = async (presetName: string) => {
    setError(null);
    if (presetName === "tannery-chart-fullpage") {
      const sample = generateTanneryMeasurementChartCanvasImage();
      await processImage(
        sample,
        "EVERWIN TANNERS - MELVISHARAM (MEASUREMENT LIST)",
        "tannery-chart-fullpage"
      );
    } else if (presetName === "example-33-32") {
      const sample = generateSampleCanvasImage("Vertical Addition (33.3 + 32.2)", [
        { val: 33.3, label: "Item 1" },
        { val: 32.2, label: "Item 2" },
      ]);
      await processImage(sample, "Vertical Addition (33.3 + 32.2)");
    } else if (presetName === "multi-vertical-lines") {
      const sample = generateMultiColumnCanvasImage();
      await processImage(sample, "2 Vertical Lines Addition");
    } else if (presetName === "receipt-4-items") {
      const sample = generateSampleCanvasImage(
        "Receipt Column Sum",
        [
          { val: 12.5, label: "Item 1" },
          { val: 45.0, label: "Item 2" },
          { val: 8.25, label: "Item 3" },
          { val: 14.25, label: "Item 4" },
        ],
        "receipt"
      );
      await processImage(sample, "Receipt Column Sum");
    } else if (presetName === "ledger-numbers") {
      const sample = generateSampleCanvasImage("Ledger Account Sum", [
        { val: 105.4, label: "Account A" },
        { val: 210.6, label: "Account B" },
        { val: 94.0, label: "Account C" },
      ]);
      await processImage(sample, "Ledger Account Sum");
    }
  };

  // Update items state from editable table (single column)
  const handleUpdateItems = (newItems: DetectedNumberItem[]) => {
    setItems(newItems);
    const newSum = computeSafeSum(newItems).sum;
    setSum(newSum);
  };

  // Update multi-column state from editable table
  const handleUpdateColumns = (newColumns: VerticalColumnLine[]) => {
    setColumns(newColumns);
    const allItems = newColumns.flatMap((c) => c.items);
    setItems(allItems);

    const calculatedGrandTotal = computeSafeSum(newColumns.map((c) => c.sum)).sum;
    setGrandTotal(calculatedGrandTotal);
    setSum(calculatedGrandTotal);

    const formula =
      newColumns.map((c) => `${c.title} (${c.sum})`).join(" + ") +
      ` = ${calculatedGrandTotal}`;
    setGrandFormula(formula);
  };

  // Retake / Scan another image
  const handleRetake = () => {
    setCurrentImage(null);
    setItems([]);
    setColumns([]);
    setGrandTotal(undefined);
    setGrandFormula(undefined);
    setSum(0);
    setNotes("");
    setError(null);
    setIsMeasurementChart(false);
    setMeasurementMetadata(undefined);
  };

  // Clear history
  const handleClearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem("photo_calc_history");
    } catch {}
  };

  // Select historical record
  const handleSelectHistoryRecord = (rec: HistoryRecord) => {
    if (rec.thumbnail) {
      setCurrentImage(rec.thumbnail);
    }
    setDetectedTitle(rec.title);
    setCalculationDate(rec.timestamp || Date.now());
    setNotes(rec.notes || "");
    const isChart = Boolean(rec.isMeasurementChart || rec.measurementMetadata);
    setIsMeasurementChart(isChart);
    setMeasurementMetadata(rec.measurementMetadata);

    if (rec.columns && rec.columns.length > 1) {
      setColumns(rec.columns);
      setGrandTotal(rec.grandTotal);
      setSum(rec.grandTotal ?? rec.sum);
      setItems(rec.items);
    } else {
      setColumns([]);
      setGrandTotal(undefined);
      setItems(rec.items);
      setSum(rec.sum);
    }
  };

  // Update notes for the current calculation session and persist to history
  const handleUpdateNotes = (newNotes: string) => {
    setNotes(newNotes);
    setHistory((prev) => {
      const updated = prev.map((rec) => {
        if (rec.timestamp === calculationDate || (currentImage && rec.thumbnail === currentImage)) {
          return { ...rec, notes: newNotes };
        }
        return rec;
      });
      try {
        localStorage.setItem("photo_calc_history", JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const handleShareCurrent = async () => {
    setIsSharing(true);
    try {
      const res = await shareCalculation({
        title: detectedTitle || "Vertical Addition Result",
        items,
        sum,
        columns,
        grandTotal,
        grandFormula,
        imageSrc: currentImage,
      });

      if (res.success) {
        showToast(
          res.type === "clipboard"
            ? "Calculation copied to clipboard!"
            : "Calculation shared successfully!"
        );
      } else if (res.type === "aborted") {
        // User closed share dialog
      } else {
        showToast("Sharing not supported on this browser.");
      }
    } catch (err) {
      console.warn("Share error:", err);
    } finally {
      setIsSharing(false);
    }
  };

  const handleExportCurrentPdf = () => {
    const success = exportToPdf({
      title: detectedTitle || "Vertical Addition Result",
      items,
      sum,
      columns,
      grandTotal,
      grandFormula,
      existingWrittenSum,
      notes,
      imageSrc: currentImage,
      calculationDate,
      measurementMetadata,
      isMeasurementChart,
    });
    if (success) {
      showToast("PDF calculation report downloaded!");
    }
  };

  const handleExportCurrentExcel = () => {
    const success = exportToExcel({
      title: detectedTitle || "Vertical Addition Result",
      items,
      sum,
      columns,
      grandTotal,
      grandFormula,
      existingWrittenSum,
      notes,
      calculationDate,
      measurementMetadata,
      isMeasurementChart,
    });
    if (success) {
      showToast("Excel calculation spreadsheet downloaded!");
    }
  };

  const currentDateObj = formatCurrentDateTime(calculationDate);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col selection:bg-blue-100 dark:selection:bg-blue-900 transition-colors duration-200">
      {/* Top Navigation */}
      <header className="bg-white/95 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 shadow-xs backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 dark:bg-blue-500 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 leading-tight">
                Photo Addition Calculator
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Automatic vertical line &amp; multi-column sum with PDF and Excel export
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Dark Mode Theme Toggle */}
            <button
              type="button"
              onClick={() => setIsDarkMode((prev) => !prev)}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode (Reduce Eye Strain)"}
              aria-label="Toggle dark mode theme"
            >
              {isDarkMode ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-slate-600" />
              )}
            </button>

            {/* Sound Toggle */}
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title={soundEnabled ? "Sound Effects Enabled" : "Sound Muted"}
            >
              {soundEnabled ? (
                <Volume2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              ) : (
                <VolumeX className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              )}
            </button>

            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Multi-Model Vision OCR</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6">
        {/* Error Alert with Retry Capability */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-sm shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3 flex-1">
              <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-rose-900 dark:text-rose-100">Unable to complete scan</div>
                <div className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">{error}</div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              {lastAttemptedImage && (
                <button
                  type="button"
                  onClick={() => processImage(lastAttemptedImage, "Retry Scan")}
                  disabled={isLoading}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
                  <span>Retry Analysis</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setError(null)}
                className="px-2.5 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:text-rose-900 dark:hover:text-rose-100 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Dynamic View: Camera vs Results */}
        {!currentImage ? (
          <div className="space-y-6">
            {/* Guide Card */}
            <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-slate-900 dark:from-blue-700 dark:via-indigo-800 dark:to-slate-900 text-white shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded-full bg-white/20 text-[11px] font-semibold tracking-wide uppercase">
                    Single &amp; Multiple Vertical Lines
                  </span>
                  <span className="text-xs text-blue-100 font-mono">33.3 + 32.2 = 65.5</span>
                </div>
                <h2 className="text-lg sm:text-xl font-bold tracking-tight">
                  Take a photo of any vertical numbers
                </h2>
                <p className="text-xs sm:text-sm text-blue-100/90 max-w-xl mt-1">
                  Snap handwriting, bills, receipts, or ledger columns. Automatic detection with instant calculation, PDF report, and Excel spreadsheet export.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleSelectPreset("example-33-32")}
                  className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 text-blue-800 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-slate-700 font-semibold text-xs inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Single Line (33.3 + 32.2)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectPreset("multi-vertical-lines")}
                  className="px-3.5 py-2.5 rounded-xl bg-indigo-500/30 text-white hover:bg-indigo-500/40 border border-white/20 font-semibold text-xs inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-indigo-200" />
                  <span>2 Vertical Lines</span>
                </button>
              </div>
            </div>

            {/* Camera / Upload Viewfinder */}
            <CameraCapture
              onCapture={(dataUrl) => processImage(dataUrl)}
              isLoading={isLoading}
              onSelectPreset={handleSelectPreset}
            />

            {/* Past History */}
            <CalculationHistory
              history={history}
              onSelectRecord={handleSelectHistoryRecord}
              onClearHistory={handleClearHistory}
              onShareSuccess={showToast}
            />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Action Bar for Current Calculation: Details, Date, PDF, Excel, Share, Retake */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Calculation Completed</span>
                  <span className="text-slate-400 dark:text-slate-500">•</span>
                  <span className="font-mono text-slate-900 dark:text-slate-100">
                    {columns.length > 1
                      ? `${columns.length} lines (${items.length} numbers)`
                      : `${items.length} numbers detected`}
                  </span>
                </div>

                {/* Current Date & Time Display Badge */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium border border-slate-200 dark:border-slate-700">
                  <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span>{currentDateObj.fullDisplay}</span>
                </div>

                {columns.length > 1 && (
                  <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800 text-[11px] font-bold">
                    Grand Total: {grandTotal ?? sum}
                  </span>
                )}
              </div>

              {/* Action Buttons: Export PDF, Export Excel, Share, Retake */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleExportCurrentPdf}
                  className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  title="Export calculation to formatted PDF document"
                >
                  <FileText className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                  <span>Export PDF</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportCurrentExcel}
                  className="px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  title="Export calculation to Microsoft Excel spreadsheet (.xlsx)"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Export Excel</span>
                </button>

                <button
                  type="button"
                  onClick={handleShareCurrent}
                  disabled={isSharing}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                  title="Share calculation results or scanned image"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Share</span>
                </button>

                <button
                  type="button"
                  onClick={handleRetake}
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>New Photo</span>
                </button>
              </div>
            </div>

            {/* Grid: Photo Viewer with Box Highlights & Vertical Sum Display */}
            <div
              className={`grid grid-cols-1 ${
                isMeasurementChart ? "xl:grid-cols-12 gap-6" : "lg:grid-cols-2 gap-6"
              } items-start`}
            >
              {/* Left: Scanned Photo with Bounding Boxes */}
              <div className={isMeasurementChart ? "xl:col-span-4" : ""}>
                <PhotoViewerWithBoxes
                  imageSrc={currentImage}
                  items={items}
                  columns={columns}
                  hoveredItemId={hoveredItemId}
                  onHoverItem={setHoveredItemId}
                  onRetake={handleRetake}
                />
              </div>

              {/* Right: Vertical Calculation Display & Editable Column / Matrix */}
              <div className={isMeasurementChart ? "xl:col-span-8" : ""}>
                <VerticalSumDisplay
                  items={items}
                  sum={sum}
                  maxDecimals={maxDecimals}
                  columns={columns}
                  grandTotal={grandTotal}
                  grandFormula={grandFormula}
                  imageSrc={currentImage}
                  existingWrittenSum={existingWrittenSum}
                  detectedTitle={detectedTitle}
                  notes={notes}
                  calculationDate={calculationDate}
                  measurementMetadata={measurementMetadata}
                  isMeasurementChart={isMeasurementChart}
                  onUpdateItems={handleUpdateItems}
                  onUpdateColumns={handleUpdateColumns}
                  onUpdateNotes={handleUpdateNotes}
                  hoveredItemId={hoveredItemId}
                  onHoverItem={setHoveredItemId}
                  onExportSuccess={showToast}
                />
              </div>
            </div>

            {/* History Section below */}
            <CalculationHistory
              history={history}
              onSelectRecord={handleSelectHistoryRecord}
              onClearHistory={handleClearHistory}
              onShareSuccess={showToast}
            />
          </div>
        )}
      </main>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold shadow-lg border border-slate-700 dark:border-slate-600 animate-in fade-in slide-in-from-bottom-2">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Network Connectivity Indicator */}
      <OfflineIndicator />

      {/* Footer */}
      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 mt-auto py-4 text-center text-xs text-slate-400 dark:text-slate-500">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Photo Addition Calculator • Precise Vertical Arithmetic</span>
          <span>Automatic date stamping, PDF reports &amp; Excel spreadsheet exports</span>
        </div>
      </footer>
    </div>
  );
}
