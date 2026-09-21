import React, { useState, useEffect, useCallback } from "react";
import { CameraCapture } from "./components/CameraCapture";
import { VerticalSumDisplay } from "./components/VerticalSumDisplay";
import { PhotoViewerWithBoxes } from "./components/PhotoViewerWithBoxes";
import { CalculationHistory } from "./components/CalculationHistory";
import { DetectedNumberItem, HistoryRecord, CalculationResult, VerticalColumnLine, MeasurementMetadata } from "./types";
import {
  computeSafeSum,
  formatDisplayNumber,
  generateSampleCanvasImage,
  generateMultiColumnCanvasImage,
  generateTanneryMeasurementChartCanvasImage,
  getPresetCalculationResult,
  partitionIntoMultipleColumns,
} from "./utils/math";
import { shareCalculation } from "./utils/share";
import {
  exportToPdf,
  exportToExcel,
  sharePdfFile,
  shareExcelFile,
  formatCurrentDateTime,
} from "./utils/export";
import { PWAInstallButton } from "./components/PWAInstallButton";
import { OfflineIndicator } from "./components/OfflineIndicator";
import { ExportShareModal } from "./components/ExportShareModal";
import { analyzeImageOffline } from "./utils/offlineAnalyzer";
import { optimizeImageForOcr } from "./utils/imageOptimizer";
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
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [shareModalFormat, setShareModalFormat] = useState<"pdf" | "excel">("pdf");

  // Online / Offline connectivity listener
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== "undefined" ? navigator.onLine : true;
  });

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast("🌐 Connection active: Cloud AI vision scanning ready.");
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast("⚡ Offline Mode: Local arithmetic & PWA active.");
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

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
      // 1. Client-Side Image Optimization: downscale to ~1400px max dimension, quality 0.85
      // Reduces 8MB-15MB phone photos to ~180KB for instantaneous upload without timeouts
      let optimizedImage = imageDataUrl;
      try {
        optimizedImage = await optimizeImageForOcr(imageDataUrl, { maxDimension: 1400, quality: 0.85 });
      } catch (optErr) {
        console.warn("Image optimization notice, continuing with raw image:", optErr);
      }

      let data: CalculationResult;
      let usedOfflineMode = false;

      if (presetName) {
        // Direct instant client-side calculation for calibrated presets
        data = getPresetCalculationResult(presetName);
      } else {
        const isOfflineEnvironment =
          typeof window !== "undefined" &&
          (window.location.protocol === "file:" || !navigator.onLine);

        if (isOfflineEnvironment) {
          // In offline mode: inspect canvas. For custom user photos, returns guidance to enter numbers
          data = await analyzeImageOffline(optimizedImage, titleHint, presetName);
          usedOfflineMode = true;
        } else {
          // Online mode: call Gemini-powered OCR backend
          try {
            const controller = new AbortController();
            let isTimedOut = false;
            const timeoutId = setTimeout(() => {
              isTimedOut = true;
              try {
                controller.abort("Document analysis timed out due to temporary network delay.");
              } catch (_) {
                controller.abort();
              }
            }, 65000);

            const response = await fetch("/api/calculate-photo", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                image: optimizedImage,
                mimeType: "image/jpeg",
                preset: presetName,
              }),
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
              const errBody = await response.json().catch(() => ({}));
              throw new Error(errBody.error || `Server returned status ${response.status}`);
            }
            const serverData = await response.json();
            if (!serverData.success) {
              throw new Error(serverData.error || "Could not read numbers from this photo.");
            }
            data = serverData;
          } catch (fetchErr: any) {
            console.warn("Online OCR request notice:", fetchErr);
            const errMsg = String(fetchErr?.message || "").toLowerCase();
            const isTimeout =
              fetchErr?.name === "AbortError" ||
              errMsg.includes("timed out") ||
              errMsg.includes("timeout");
            const isTemporaryIssue =
              errMsg.includes("503") ||
              errMsg.includes("high demand") ||
              errMsg.includes("failed to fetch") ||
              !navigator.onLine;

            // In case of timeout or network interruption, gracefully load the photo with editable columns
            if (isTimeout || isTemporaryIssue) {
              try {
                data = await analyzeImageOffline(optimizedImage, titleHint, presetName);
                usedOfflineMode = true;
                showToast("⚡ Photo loaded into interactive multi-column table for direct editing & calculation");
              } catch (fallbackErr) {
                throw new Error(
                  "Document analysis timed out due to temporary network delay. You can tap 'Retry Analysis' or select an instant preset."
                );
              }
            } else {
              throw fetchErr;
            }
          }
        }
      }

      // Check if data returned an error or no valid numbers
      if (!data.success) {
        throw new Error(data.error || "No clear numbers could be detected in this photo.");
      }

      const hasValidItems =
        (data.columns && data.columns.length > 0 && data.columns.some((c) => c.items.length > 0)) ||
        (data.items && data.items.length > 0);

      if (!hasValidItems) {
        throw new Error(
          "No clearly legible numbers were found in this photo. Please make sure the photo is well-lit and in focus, or enter the numbers manually into the table."
        );
      }

      if (usedOfflineMode) {
        showToast("⚡ Analyzed on device");
      }

      setCurrentImage(optimizedImage);
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
        const detectedItems =
          data.items && data.items.length > 0
            ? data.items
            : data.columns && data.columns[0]?.items
            ? data.columns[0].items
            : [];
        setItems(detectedItems);

        // If 4 or more numbers are detected, automatically partition into multiple columns
        if (detectedItems.length >= 4) {
          const colCount = detectedItems.length >= 24 ? 8 : (detectedItems.length >= 10 ? 4 : 2);
          const multiCols = partitionIntoMultipleColumns(detectedItems, colCount);
          setColumns(multiCols);
          const calculatedGrandTotal = computeSafeSum(multiCols.map((c) => c.sum)).sum;
          setGrandTotal(calculatedGrandTotal);
          setSum(calculatedGrandTotal);
          setGrandFormula(multiCols.map((c) => `${c.title} (${c.sum})`).join(" + ") + ` = ${calculatedGrandTotal}`);
        } else {
          setColumns(data.columns && data.columns.length > 0 ? data.columns : []);
          setGrandTotal(undefined);
          setGrandFormula(undefined);
          const calculatedSum =
            typeof data.sum === "number" && !isNaN(data.sum) && data.sum !== 0
              ? data.sum
              : computeSafeSum(detectedItems).sum;
          setSum(calculatedSum);
        }
        setMaxDecimals(data.maxDecimals || 1);
      }

      // Record to calculation history with timestamp
      const totalSum =
        data.grandTotal ??
        (typeof data.sum === "number" && !isNaN(data.sum) ? data.sum : computeSafeSum(data.items || []).sum);
      saveToHistory({
        id: `rec-${scanTimestamp}`,
        timestamp: scanTimestamp,
        thumbnail: optimizedImage,
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
      const rawMsg = String(err?.message || "");
      const isAbort =
        err?.name === "AbortError" ||
        rawMsg.toLowerCase().includes("aborted") ||
        rawMsg.toLowerCase().includes("signal is aborted") ||
        rawMsg.toLowerCase().includes("timeout") ||
        rawMsg.toLowerCase().includes("timed out");

      const errorMsg = isAbort
        ? "Document analysis timed out. Your photo is loaded on the left — you can enter your numbers directly into the column table or retry scanning."
        : rawMsg ||
          "Could not detect numbers from this photo. You can enter them manually into the table on the right, or take a clearer photo.";

      setError(errorMsg);
      showToast(`⚠️ ${errorMsg}`);

      // Crucial: Retain the user's uploaded photo in view so they can see the original document!
      setCurrentImage(imageDataUrl);
      setDetectedTitle(titleHint || "Scanned Photo");
      setIsMeasurementChart(false);
      setMeasurementMetadata(undefined);
      setNotes("Numbers could not be automatically detected. Enter numbers into the column table to calculate instantly.");

      // Initialize an empty column ready for manual input with live addition
      const initialCol: VerticalColumnLine = {
        id: "col-manual-1",
        title: "Column 1",
        items: [],
        sum: 0,
        formula: "0",
        maxDecimals: 1,
      };
      setColumns([initialCol]);
      setItems([]);
      setSum(0);
      setGrandTotal(undefined);
      setGrandFormula(undefined);
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
    } else if (rec.items && rec.items.length >= 4) {
      const colCount = rec.items.length >= 24 ? 8 : (rec.items.length >= 10 ? 4 : 2);
      const multiCols = partitionIntoMultipleColumns(rec.items, colCount);
      setColumns(multiCols);
      const calculatedGrandTotal = computeSafeSum(multiCols.map((c) => c.sum)).sum;
      setGrandTotal(calculatedGrandTotal);
      setSum(calculatedGrandTotal);
      setItems(rec.items);
    } else {
      setColumns(rec.columns || []);
      setGrandTotal(undefined);
      setItems(rec.items);
      setSum(rec.sum);
    }
  };

  // Rename title for a historical calculation session
  const handleRenameRecord = (id: string, newTitle: string) => {
    setHistory((prev) => {
      const updated = prev.map((rec) => {
        if (rec.id === id) {
          return { ...rec, title: newTitle };
        }
        return rec;
      });
      try {
        localStorage.setItem("photo_calc_history", JSON.stringify(updated));
      } catch (e) {
        console.warn("Could not write updated title to localStorage", e);
      }
      return updated;
    });

    // If this session is currently active in the viewer, update detectedTitle
    const activeRec = history.find((r) => r.id === id);
    if (
      activeRec &&
      (activeRec.timestamp === calculationDate || (currentImage && activeRec.thumbnail === currentImage))
    ) {
      setDetectedTitle(newTitle);
    }

    showToast(`Renamed calculation to "${newTitle}"`);
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
    try {
      const success = exportToPdf({
        title: detectedTitle || "Measurement Chart",
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
        isMeasurementChart: isMeasurementChart || (columns && columns.length >= 4),
      });
      if (success) {
        showToast("PDF calculation report downloaded!");
      } else {
        showToast("PDF generation ready. If blocked, check popup permissions.");
      }
    } catch (err) {
      console.error("Export PDF error:", err);
      showToast("Could not download PDF.");
    }
  };

  const handleShareCurrentPdf = () => {
    handleOpenShareModal("pdf");
  };

  const handleExportCurrentExcel = () => {
    try {
      const success = exportToExcel({
        title: detectedTitle || "Measurement Chart",
        items,
        sum,
        columns,
        grandTotal,
        grandFormula,
        existingWrittenSum,
        notes,
        calculationDate,
        measurementMetadata,
        isMeasurementChart: isMeasurementChart || (columns && columns.length >= 4),
      });
      if (success) {
        showToast("Excel calculation spreadsheet (.xlsx) downloaded!");
      } else {
        showToast("Excel file generated.");
      }
    } catch (err) {
      console.error("Export Excel error:", err);
      showToast("Could not download Excel.");
    }
  };

  const handleShareCurrentExcel = () => {
    handleOpenShareModal("excel");
  };

  const handleOpenShareModal = (format: "pdf" | "excel" = "pdf") => {
    setShareModalFormat(format);
    setIsShareModalOpen(true);
  };

  // Start a new blank calculation sheet immediately (works 100% offline without needing a photo)
  const handleStartBlankSheet = (colsCount: number = 2) => {
    const defaultCols: VerticalColumnLine[] = [];
    const defaultItems: DetectedNumberItem[] = [];
    for (let c = 0; c < colsCount; c++) {
      const colItems: DetectedNumberItem[] = [
        {
          id: `manual-c${c}-r0-${Date.now()}`,
          value: 0,
          rawText: "0",
          label: "Row 1",
          columnIndex: c,
        },
      ];
      defaultItems.push(...colItems);
      defaultCols.push({
        id: `col-${c + 1}-${Date.now()}`,
        title: colsCount >= 4 ? `Column ${c + 1}` : `Col ${c + 1}`,
        items: colItems,
        sum: 0,
        formula: "0",
        maxDecimals: 1,
      });
    }

    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 800;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, 0, 600, 800);
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1;
      for (let y = 40; y < 800; y += 40) {
        ctx.beginPath();
        ctx.moveTo(20, y);
        ctx.lineTo(580, y);
        ctx.stroke();
      }
    }
    const cleanGridDataUrl = canvas.toDataURL("image/png");

    setCurrentImage(cleanGridDataUrl);
    setDetectedTitle(colsCount >= 4 ? "Tannery Measurement Chart" : "Calculation Sheet");
    setItems(defaultItems);
    setSum(0);
    setMaxDecimals(1);
    setColumns(defaultCols);
    setGrandTotal(0);
    setGrandFormula("Ready for numbers");
    setIsMeasurementChart(colsCount >= 4);
    setNotes("Offline calculation sheet. Tap any cell to enter numbers.");
    setCalculationDate(Date.now());
    setError(null);
    showToast(`⚡ New ${colsCount}-column calculation sheet ready.`);
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
                Measurement Chart
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Offline measurement chart, tannery tally &amp; vertical sum calculator
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Online / Offline Status Badge */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold ${
                isOnline
                  ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/80 text-emerald-700 dark:text-emerald-300"
                  : "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/80 text-amber-700 dark:text-amber-300"
              }`}
              title={
                isOnline
                  ? "Connected to Internet: Cloud AI OCR is ready"
                  : "Working 100% Offline: Local calculation engine & offline storage active"
              }
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isOnline ? "bg-emerald-500" : "bg-amber-500 animate-pulse"
                }`}
              />
              <span className="hidden sm:inline">{isOnline ? "Online" : "Offline"}</span>
            </div>

            {/* PWA Install / APK Download Button */}
            <PWAInstallButton />

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
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="px-2 py-0.5 rounded-full bg-white/20 text-[11px] font-semibold tracking-wide uppercase">
                    Single &amp; Multiple Vertical Lines
                  </span>
                  <span className="text-xs text-blue-100 font-mono">33.3 + 32.2 = 65.5</span>
                  <span
                    className="px-2 py-0.5 rounded-full bg-amber-400/25 text-amber-200 text-[11px] font-semibold border border-amber-300/30 font-mono"
                    title="When performing addition, any 3-digit number has a decimal point placed after the first two digits (e.g., 333 as 33.3)"
                  >
                    3-digit rule: 333 → 33.3
                  </span>
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
                  onClick={() => handleStartBlankSheet(2)}
                  className="px-3.5 py-2.5 rounded-xl bg-emerald-500/25 hover:bg-emerald-500/35 border border-emerald-300/40 text-emerald-100 font-semibold text-xs inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  title="Create an empty calculation sheet immediately (no photo required, 100% offline)"
                >
                  <Calculator className="w-4 h-4 text-emerald-300" />
                  <span>⚡ Blank Sheet (2 Cols)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleStartBlankSheet(8)}
                  className="px-3.5 py-2.5 rounded-xl bg-amber-500/25 hover:bg-amber-500/35 border border-amber-300/40 text-amber-100 font-semibold text-xs inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  title="Create an empty 8-column tannery measurement tally sheet immediately"
                >
                  <FileSpreadsheet className="w-4 h-4 text-amber-300" />
                  <span>⚡ Tannery Chart (8 Cols)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectPreset("example-33-32")}
                  className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 text-blue-800 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-slate-700 font-semibold text-xs inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Single Line</span>
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
              onRenameRecord={handleRenameRecord}
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

                {/* Prominent Result Badge in Top Bar */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs">
                  <span className="text-[11px] font-bold uppercase tracking-wider opacity-90">
                    {columns.length > 1 ? "Grand Total:" : "Result:"}
                  </span>
                  <span className="font-mono text-base font-black tracking-tight">
                    {formatDisplayNumber(grandTotal ?? sum)}
                  </span>
                </div>
              </div>

              {/* Action Buttons: PDF (Download/Share), Excel (Download/Share), Share Text, New Photo */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* PDF Group */}
                <div className="inline-flex rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 p-0.5 shadow-xs">
                  <button
                    type="button"
                    onClick={handleExportCurrentPdf}
                    className="px-2.5 py-1.5 rounded-lg text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Download calculation report as PDF (.pdf)"
                  >
                    <FileText className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                    <span>Download PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleShareCurrentPdf}
                    disabled={isSharing}
                    className="px-2 py-1.5 rounded-lg text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer border-l border-rose-200 dark:border-rose-900/60 disabled:opacity-50"
                    title="Share PDF file via WhatsApp, Email, etc."
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Share</span>
                  </button>
                </div>

                {/* Excel Group */}
                <div className="inline-flex rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 p-0.5 shadow-xs">
                  <button
                    type="button"
                    onClick={handleExportCurrentExcel}
                    className="px-2.5 py-1.5 rounded-lg text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Download calculation spreadsheet as Microsoft Excel (.xlsx)"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Download Excel</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleShareCurrentExcel}
                    disabled={isSharing}
                    className="px-2 py-1.5 rounded-lg text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer border-l border-emerald-200 dark:border-emerald-900/60 disabled:opacity-50"
                    title="Share Excel (.xlsx) file via WhatsApp, Email, etc."
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Share</span>
                  </button>
                </div>

                {/* Text & Image Share */}
                <button
                  type="button"
                  onClick={handleShareCurrent}
                  disabled={isSharing}
                  className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                  title="Share formatted calculation summary with photo"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Share Text</span>
                </button>

                {/* Full Export & Share Sheet Button */}
                <button
                  type="button"
                  onClick={() => handleOpenShareModal("pdf")}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white dark:bg-slate-700 dark:hover:bg-slate-600 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  title="Open full PDF and Excel share & export options"
                >
                  <Share2 className="w-3.5 h-3.5 text-blue-400" />
                  <span>Share Sheet</span>
                </button>

                {/* Retake / New Photo */}
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
                  onOpenShareModal={handleOpenShareModal}
                />
              </div>
            </div>

            {/* History Section below */}
            <CalculationHistory
              history={history}
              onSelectRecord={handleSelectHistoryRecord}
              onClearHistory={handleClearHistory}
              onShareSuccess={showToast}
              onRenameRecord={handleRenameRecord}
            />
          </div>
        )}
      </main>

      {/* Export & Share Modal with Full Offline & Native App Fallback */}
      <ExportShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        defaultFormat={shareModalFormat}
        onToast={showToast}
        data={{
          title: detectedTitle || "Measurement Chart",
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
          isMeasurementChart: isMeasurementChart || (columns && columns.length >= 4),
        }}
      />

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
          <span>Measurement Chart • Precise Vertical &amp; Matrix Arithmetic</span>
          <span>Automatic date stamping, PDF reports &amp; Excel spreadsheet exports</span>
        </div>
      </footer>
    </div>
  );
}
