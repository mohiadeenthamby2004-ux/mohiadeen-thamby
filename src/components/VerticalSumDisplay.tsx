import React, { useState, useEffect, useRef, useMemo } from "react";
import { DetectedNumberItem, VerticalColumnLine, MeasurementMetadata } from "../types";
import {
  Copy,
  Check,
  Plus,
  Trash2,
  Edit3,
  CheckCircle2,
  AlertTriangle,
  Columns,
  Share2,
  FileText,
  FileSpreadsheet,
  Calendar,
  Grid,
  Layers,
  Building2,
  Eye,
  Download,
  BarChart3,
  SlidersHorizontal,
  Table,
} from "lucide-react";
import {
  formatVerticalColumn,
  computeSafeSum,
  formatDisplayNumber,
  normalize3DigitValue,
  formatNormalizedInputHint,
  partitionIntoMultipleColumns,
  calculateColumnSummaries,
} from "../utils/math";
import { shareCalculation } from "../utils/share";
import {
  exportToPdf,
  exportToExcel,
  sharePdfFile,
  shareExcelFile,
  previewPdf,
  formatCurrentDateTime,
} from "../utils/export";
import { MeasurementChartMatrix } from "./MeasurementChartMatrix";
import { AnimatedGrandTotal } from "./AnimatedGrandTotal";

interface VerticalSumDisplayProps {
  items: DetectedNumberItem[];
  sum: number;
  maxDecimals: number;
  columns?: VerticalColumnLine[];
  grandTotal?: number;
  grandFormula?: string;
  imageSrc?: string | null;
  existingWrittenSum?: number | null;
  detectedTitle?: string;
  notes?: string;
  calculationDate?: Date | string | number;
  measurementMetadata?: MeasurementMetadata;
  isMeasurementChart?: boolean;
  onUpdateItems: (newItems: DetectedNumberItem[]) => void;
  onUpdateColumns?: (newColumns: VerticalColumnLine[]) => void;
  onUpdateNotes?: (newNotes: string) => void;
  hoveredItemId: string | null;
  onHoverItem: (id: string | null) => void;
  onExportSuccess?: (msg: string) => void;
  onOpenShareModal?: (format: "pdf" | "excel") => void;
}

export const VerticalSumDisplay: React.FC<VerticalSumDisplayProps> = ({
  items,
  sum,
  columns,
  grandTotal,
  grandFormula,
  imageSrc,
  existingWrittenSum,
  detectedTitle = "Vertical Addition Result",
  notes,
  calculationDate,
  measurementMetadata,
  isMeasurementChart,
  onUpdateItems,
  onUpdateColumns,
  onUpdateNotes,
  hoveredItemId,
  onHoverItem,
  onExportSuccess,
  onOpenShareModal,
}) => {
  const isFullPageMeasurementChart = Boolean(
    isMeasurementChart ||
    measurementMetadata?.isMeasurementChart ||
    (columns && columns.length >= 4)
  );

  // Active columns: use columns if multiple; otherwise partition items into multiple columns
  const activeColumns = useMemo<VerticalColumnLine[]>(() => {
    if (Array.isArray(columns) && columns.length > 1) {
      return columns;
    }
    const allItems = items && items.length > 0 ? items : (columns && columns[0] ? columns[0].items : []);
    if (allItems.length >= 4) {
      const targetColCount = allItems.length >= 24 ? 8 : (allItems.length >= 10 ? 4 : 2);
      return partitionIntoMultipleColumns(allItems, targetColCount);
    }
    if (columns && columns.length === 1) {
      return columns;
    }
    if (allItems.length > 0) {
      const { sum: colSum, formula: colFormula, maxDecimals: colDecimals } = computeSafeSum(allItems);
      return [
        {
          id: "col-1",
          title: "Column 1",
          items: allItems,
          sum: colSum,
          formula: colFormula,
          maxDecimals: colDecimals,
        },
      ];
    }
    return [];
  }, [columns, items]);

  const isMultiColumn = activeColumns.length > 1;
  const effectiveGrandTotal = grandTotal ?? computeSafeSum(activeColumns.map((c) => c.sum)).sum;
  const effectiveGrandFormula = grandFormula || activeColumns.map((c) => `${c.title} (${c.sum})`).join(" + ");

  const summaryData = useMemo(() => {
    return calculateColumnSummaries(activeColumns, effectiveGrandTotal);
  }, [activeColumns, effectiveGrandTotal]);

  // Default view is "summary" (summarised only with multiple columns)
  const [matrixViewMode, setMatrixViewMode] = useState<"summary" | "matrix" | "cards">("summary");

  // Keep parent columns state in sync if activeColumns partitioned into multiple columns
  useEffect(() => {
    if ((!columns || columns.length <= 1) && activeColumns.length > 1 && onUpdateColumns) {
      onUpdateColumns(activeColumns);
    }
  }, [columns, activeColumns, onUpdateColumns]);

  const handleSplitColumns = (targetCount: number) => {
    const allItems = items && items.length > 0 ? items : activeColumns.flatMap((c) => c.items);
    if (allItems.length === 0) return;
    const newCols = partitionIntoMultipleColumns(allItems, targetCount);
    if (onUpdateColumns) {
      onUpdateColumns(newCols);
    }
    if (onExportSuccess) {
      onExportSuccess(`Result changed to ${newCols.length} multiple columns`);
    }
  };

  const [copied, setCopied] = useState<boolean>(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [isSharingPdf, setIsSharingPdf] = useState<boolean>(false);
  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);
  const [isSharingExcel, setIsSharingExcel] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newRowValue, setNewRowValue] = useState<string>("");
  const [targetColumnIndex, setTargetColumnIndex] = useState<number>(0);
  const [showAddRow, setShowAddRow] = useState<boolean>(false);

  // Inline Editable Notes State
  const [localNotes, setLocalNotes] = useState<string>(notes || "");
  const [isEditingNotes, setIsEditingNotes] = useState<boolean>(false);
  const [notesSaveStatus, setNotesSaveStatus] = useState<string | null>(null);
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setLocalNotes(notes || "");
  }, [notes]);

  const handleSaveNotes = (valueToSave?: string) => {
    const val = typeof valueToSave === "string" ? valueToSave : localNotes;
    const trimmed = val.trim();
    setLocalNotes(trimmed);
    setIsEditingNotes(false);
    if (onUpdateNotes) {
      onUpdateNotes(trimmed);
    }
    setNotesSaveStatus("Saved to PDF & session");
    setTimeout(() => {
      setNotesSaveStatus(null);
    }, 2500);
  };

  const handleStartEditingNotes = () => {
    setIsEditingNotes(true);
    setTimeout(() => {
      notesTextareaRef.current?.focus();
    }, 50);
  };

  const dateInfo = formatCurrentDateTime(calculationDate);

  // Multi-column copy or single-column copy
  const handleCopy = () => {
    let text = "";
    if (isMultiColumn && activeColumns.length > 0) {
      if (matrixViewMode === "summary") {
        text = `========================================\n`;
        text += `${detectedTitle || "MEASUREMENT LIST"} - SUMMARISED RESULT\n`;
        text += `Date: ${dateInfo.fullDisplay}\n`;
        text += `Total Columns: ${summaryData.columnCount}\n`;
        text += `Total Pieces/Count: ${summaryData.totalCount}\n`;
        text += `Grand Total: ${formatDisplayNumber(summaryData.grandTotal)}\n`;
        text += `Average per piece: ${summaryData.average}\n`;
        text += `----------------------------------------\n`;
        text += `COLUMN BREAKDOWN:\n`;
        summaryData.columns.forEach((c) => {
          text += `• ${c.title}: ${c.count} items, Subtotal = ${formatDisplayNumber(c.sum)} (Avg: ${c.average})\n`;
        });
        text += `----------------------------------------\n`;
        text += `GRAND TOTAL = ${formatDisplayNumber(summaryData.grandTotal)}\n`;
        text += `========================================`;
      } else {
        text = activeColumns
          .map((col) => `${col.title}:\n` + formatVerticalColumn(col.items, col.sum))
          .join("\n\n");
        text += `\n\n====================\nGRAND TOTAL = ${effectiveGrandTotal}`;
        if (effectiveGrandFormula) {
          text += ` (${effectiveGrandFormula})`;
        }
      }
    } else {
      text = formatVerticalColumn(items, sum);
      if (typeof existingWrittenSum === "number") {
        text += `\n(Written Note Total: ${existingWrittenSum})`;
      }
    }

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Handle Web Share API
  const handleShare = async () => {
    setIsSharing(true);
    setShareFeedback(null);
    try {
      const result = await shareCalculation({
        title: detectedTitle || "Vertical Addition Result",
        items,
        sum: effectiveGrandTotal,
        columns: activeColumns,
        grandTotal: effectiveGrandTotal,
        grandFormula: effectiveGrandFormula,
        imageSrc,
      });

      if (result.success) {
        if (result.type === "clipboard") {
          setShareFeedback("Copied to clipboard!");
        } else {
          setShareFeedback("Shared!");
        }
        setTimeout(() => setShareFeedback(null), 2500);
      } else if (result.type === "aborted") {
        // user simply closed the system share sheet
      } else {
        setShareFeedback("Share unavailable");
        setTimeout(() => setShareFeedback(null), 2500);
      }
    } catch (err) {
      console.warn("Share error:", err);
    } finally {
      setIsSharing(false);
    }
  };

  // Handle Export to PDF (.pdf)
  const handleExportPdf = () => {
    setIsExportingPdf(true);
    try {
      const success = exportToPdf({
        title: detectedTitle || "Measurement Chart",
        items,
        sum: effectiveGrandTotal,
        columns: activeColumns,
        grandTotal: effectiveGrandTotal,
        grandFormula: effectiveGrandFormula,
        existingWrittenSum,
        notes: localNotes || notes,
        imageSrc,
        calculationDate,
        measurementMetadata,
        isMeasurementChart: isFullPageMeasurementChart,
      });
      if (success && onExportSuccess) {
        onExportSuccess("PDF report downloaded successfully!");
      }
    } catch (err) {
      console.error("PDF export error:", err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Handle Share PDF File directly or open full share dialog
  const handleSharePdf = async () => {
    if (onOpenShareModal) {
      onOpenShareModal("pdf");
      return;
    }
    setIsSharingPdf(true);
    setShareFeedback(null);
    try {
      const res = await sharePdfFile({
        title: detectedTitle || "Measurement Chart",
        items,
        sum: effectiveGrandTotal,
        columns: activeColumns,
        grandTotal: effectiveGrandTotal,
        grandFormula: effectiveGrandFormula,
        existingWrittenSum,
        notes: localNotes || notes,
        imageSrc,
        calculationDate,
        measurementMetadata,
        isMeasurementChart: isFullPageMeasurementChart,
      });
      if (res.success) {
        if (onExportSuccess) onExportSuccess(res.message);
        setShareFeedback(res.type === "native_share" ? "PDF Shared!" : "PDF Downloaded!");
        setTimeout(() => setShareFeedback(null), 3500);
      } else {
        // Fallback to direct download
        handleExportPdf();
      }
    } catch (err) {
      console.error("Share PDF error:", err);
      handleExportPdf();
    } finally {
      setIsSharingPdf(false);
    }
  };

  // Handle Preview PDF in browser tab
  const handlePreviewPdf = () => {
    try {
      const ok = previewPdf({
        title: detectedTitle || "Measurement Chart",
        items,
        sum: effectiveGrandTotal,
        columns: activeColumns,
        grandTotal: effectiveGrandTotal,
        grandFormula: effectiveGrandFormula,
        existingWrittenSum,
        notes: localNotes || notes,
        imageSrc,
        calculationDate,
        measurementMetadata,
        isMeasurementChart: isFullPageMeasurementChart,
      });
      if (ok && onExportSuccess) {
        onExportSuccess("Opening PDF report preview...");
      }
    } catch (err) {
      console.error("Preview PDF error:", err);
    }
  };

  // Handle Export to Excel (.xlsx)
  const handleExportExcel = () => {
    setIsExportingExcel(true);
    try {
      const success = exportToExcel({
        title: detectedTitle || "Measurement Chart",
        items,
        sum: effectiveGrandTotal,
        columns: activeColumns,
        grandTotal: effectiveGrandTotal,
        grandFormula: effectiveGrandFormula,
        existingWrittenSum,
        notes: localNotes || notes,
        calculationDate,
        measurementMetadata,
        isMeasurementChart: isFullPageMeasurementChart,
      });
      if (success && onExportSuccess) {
        onExportSuccess("Excel spreadsheet (.xlsx) downloaded successfully!");
      }
    } catch (err) {
      console.error("Excel export error:", err);
    } finally {
      setIsExportingExcel(false);
    }
  };

  // Handle Share Excel File directly or open full share dialog
  const handleShareExcel = async () => {
    if (onOpenShareModal) {
      onOpenShareModal("excel");
      return;
    }
    setIsSharingExcel(true);
    setShareFeedback(null);
    try {
      const res = await shareExcelFile({
        title: detectedTitle || "Measurement Chart",
        items,
        sum: effectiveGrandTotal,
        columns: activeColumns,
        grandTotal: effectiveGrandTotal,
        grandFormula: effectiveGrandFormula,
        existingWrittenSum,
        notes: localNotes || notes,
        calculationDate,
        measurementMetadata,
        isMeasurementChart: isFullPageMeasurementChart,
      });
      if (res.success) {
        if (onExportSuccess) onExportSuccess(res.message);
        setShareFeedback(res.type === "native_share" ? "Excel Shared!" : "Excel Downloaded!");
        setTimeout(() => setShareFeedback(null), 3500);
      } else {
        // Fallback to direct download
        handleExportExcel();
      }
    } catch (err) {
      console.error("Share Excel error:", err);
      handleExportExcel();
    } finally {
      setIsSharingExcel(false);
    }
  };

  // Update item value in single or multi column mode
  const handleValueChange = (id: string, valStr: string) => {
    const numericVal = normalize3DigitValue(valStr);

    if (isMultiColumn && columns && onUpdateColumns) {
      const updated = columns.map((col) => {
        const hasItem = col.items.some((i) => i.id === id);
        if (!hasItem) return col;

        const newItems = col.items.map((i) =>
          i.id === id ? { ...i, value: numericVal, rawText: valStr } : i
        );
        const newColSum = computeSafeSum(newItems).sum;
        const newFormula = newItems.map((i) => i.value).join(" + ") + " = " + newColSum;
        return {
          ...col,
          items: newItems,
          sum: newColSum,
          formula: newFormula,
        };
      });
      onUpdateColumns(updated);
    } else {
      const newItems = items.map((i) =>
        i.id === id ? { ...i, value: numericVal, rawText: valStr } : i
      );
      onUpdateItems(newItems);
    }
  };

  // Update item label
  const handleLabelChange = (id: string, newLabel: string) => {
    if (isMultiColumn && columns && onUpdateColumns) {
      const updated = columns.map((col) => ({
        ...col,
        items: col.items.map((i) => (i.id === id ? { ...i, label: newLabel } : i)),
      }));
      onUpdateColumns(updated);
    } else {
      const newItems = items.map((i) => (i.id === id ? { ...i, label: newLabel } : i));
      onUpdateItems(newItems);
    }
  };

  // Delete an item row
  const handleDeleteItem = (id: string) => {
    if (isMultiColumn && columns && onUpdateColumns) {
      const updated = columns.map((col) => {
        const hasItem = col.items.some((i) => i.id === id);
        if (!hasItem) return col;

        const newItems = col.items.filter((i) => i.id !== id);
        const newColSum = computeSafeSum(newItems).sum;
        const newFormula = newItems.map((i) => i.value).join(" + ") + " = " + newColSum;
        return {
          ...col,
          items: newItems,
          sum: newColSum,
          formula: newFormula,
        };
      });
      onUpdateColumns(updated);
    } else {
      const newItems = items.filter((i) => i.id !== id);
      onUpdateItems(newItems);
    }
  };

  // Add a new row to a column
  const handleAddNewItem = (e: React.FormEvent) => {
    e.preventDefault();
    const val = normalize3DigitValue(newRowValue);
    if (isNaN(val)) return;

    if (isMultiColumn && columns && onUpdateColumns) {
      const updated = columns.map((col, idx) => {
        if (idx !== targetColumnIndex) return col;
        const newItem: DetectedNumberItem = {
          id: `item-c${idx}-${Date.now()}`,
          value: val,
          rawText: newRowValue,
          label: `Item ${col.items.length + 1}`,
          columnIndex: idx,
        };
        const newItems = [...col.items, newItem];
        const newColSum = computeSafeSum(newItems).sum;
        const newFormula = newItems.map((i) => i.value).join(" + ") + " = " + newColSum;
        return {
          ...col,
          items: newItems,
          sum: newColSum,
          formula: newFormula,
        };
      });
      onUpdateColumns(updated);
    } else {
      const newItem: DetectedNumberItem = {
        id: `item-${Date.now()}`,
        value: val,
        rawText: newRowValue,
        label: `Item ${items.length + 1}`,
      };
      onUpdateItems([...items, newItem]);
    }

    setNewRowValue("");
    setShowAddRow(false);
  };

  // Add an entire new vertical column
  const handleAddNewColumn = () => {
    if (!onUpdateColumns) return;
    const currentCols = columns || [];
    const newColIndex = currentCols.length;

    const newCol: VerticalColumnLine = {
      id: `col-${newColIndex}-${Date.now()}`,
      title: `Vertical Line ${newColIndex + 1}`,
      items: [
        {
          id: `item-c${newColIndex}-1-${Date.now()}`,
          value: 10.0,
          rawText: "10.0",
          label: "Item 1",
          columnIndex: newColIndex,
        },
        {
          id: `item-c${newColIndex}-2-${Date.now()}`,
          value: 20.0,
          rawText: "20.0",
          label: "Item 2",
          columnIndex: newColIndex,
        },
      ],
      sum: 30.0,
      formula: "10 + 20 = 30",
      maxDecimals: 1,
    };

    onUpdateColumns([...currentCols, newCol]);
  };

  // Render a single vertical column card
  const renderColumnCard = (
    colItems: DetectedNumberItem[],
    colSum: number,
    colTitle: string,
    colFormula: string,
    colWrittenSum?: number | null,
    colIdx = 0
  ) => {
    const hasWritten = typeof colWrittenSum === "number" && !isNaN(colWrittenSum);
    const matches = hasWritten && Math.abs(colSum - colWrittenSum) < 0.0001;

    return (
      <div
        key={`col-card-${colIdx}`}
        className={`bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between overflow-hidden ${
          isMultiColumn ? "flex-1 min-w-[280px]" : "w-full max-w-md mx-auto"
        }`}
      >
        {/* Column Header */}
        <div className="px-4 py-3 bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 dark:bg-blue-400" />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
              {colTitle}
            </span>
          </div>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-mono">
            {colItems.length} {colItems.length === 1 ? "value" : "values"}
          </span>
        </div>

        {/* Written sum note if present */}
        {hasWritten && (
          <div
            className={`px-3 py-1.5 text-[11px] font-medium flex items-center gap-1.5 border-b ${
              matches
                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-100 dark:border-emerald-800"
                : "bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-800"
            }`}
          >
            {matches ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Verified with written total: <strong>{formatDisplayNumber(colWrittenSum)}</strong></span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Written: {formatDisplayNumber(colWrittenSum)} • Calculated: {formatDisplayNumber(colSum)}</span>
              </>
            )}
          </div>
        )}

        {/* Numbers Stack */}
        <div className="p-4 flex-1 font-mono">
          {colItems.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500 font-sans">
              No numbers in this column yet.
              <br />
              Click below to add a number.
            </div>
          ) : (
            <div className="space-y-1.5">
              {colItems.map((item, index) => {
                const isHovered = hoveredItemId === item.id;
                const isEditing = editingId === item.id;

                return (
                  <div
                    key={item.id}
                    onMouseEnter={() => onHoverItem(item.id)}
                    onMouseLeave={() => onHoverItem(null)}
                    className={`group relative flex items-center justify-between p-1.5 rounded-lg transition-all ${
                      isHovered
                        ? "bg-blue-50/90 dark:bg-blue-950/50 ring-1 ring-blue-300 dark:ring-blue-700"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/70"
                    }`}
                  >
                    {/* Left Label & Action buttons */}
                    <div className="flex items-center gap-1.5 min-w-0 pr-1 font-sans">
                      {isEditing ? (
                        <input
                          type="text"
                          defaultValue={item.label || `Line ${index + 1}`}
                          onBlur={(e) => handleLabelChange(item.id, e.target.value)}
                          className="text-[11px] px-1.5 py-0.5 border border-blue-400 dark:border-blue-500 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 w-20 outline-none font-sans"
                          placeholder="Label"
                        />
                      ) : (
                        <span
                          className="text-[11px] text-slate-400 dark:text-slate-500 truncate max-w-[90px]"
                          title={item.label}
                        >
                          {item.label || `Item ${index + 1}`}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => setEditingId(isEditing ? null : item.id)}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-0.5 rounded transition-opacity cursor-pointer"
                        title="Edit number or label"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item.id)}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-0.5 rounded transition-opacity cursor-pointer"
                        title="Delete number"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Right: Operator & Value */}
                    <div className="flex items-center space-x-2 text-right">
                      <span className="w-3 text-slate-400 dark:text-slate-500 text-sm font-bold text-center select-none font-sans">
                        {index === 0 ? "" : "+"}
                      </span>

                      {isEditing ? (
                        <input
                          type="number"
                          step="any"
                          value={item.value}
                          onChange={(e) => handleValueChange(item.id, e.target.value)}
                          className="w-24 text-right font-mono text-lg font-bold text-slate-900 dark:text-slate-100 border-b-2 border-blue-500 bg-blue-50/50 dark:bg-blue-950/40 outline-none px-1"
                          autoFocus
                        />
                      ) : (
                        <span
                          onClick={() => setEditingId(item.id)}
                          className="font-mono text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 select-all"
                          title="Click to edit value"
                        >
                          {formatDisplayNumber(item.value)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Traditional Mathematical Summation Line */}
          <div className="my-2.5 border-b-2 border-slate-700 dark:border-slate-300" />

          {/* Line Final Result with Classical Accounting Double Underline */}
          <div className="flex items-center justify-between px-3 py-2.5 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/60 dark:to-indigo-950/60 rounded-xl border border-blue-200/80 dark:border-blue-900/60">
            <div className="flex flex-col">
              <span className="text-[11px] font-sans font-extrabold text-blue-900 dark:text-blue-200 uppercase tracking-wider flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                {isMultiColumn ? `${colTitle} Total` : "Total Sum"}
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                {colItems.length} {colItems.length === 1 ? "entry" : "entries"}
              </span>
            </div>
            <div className="text-right">
              <div className="font-mono text-2xl sm:text-3xl font-black text-blue-700 dark:text-blue-300 tracking-tight border-b-4 border-double border-blue-600 dark:border-blue-400 pb-0.5">
                {formatDisplayNumber(colSum)}
              </div>
            </div>
          </div>
        </div>

        {/* Small formula preview in footer */}
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
          {colFormula}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
      {/* Header bar */}
      <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              {detectedTitle || "Vertical Column Calculation"}
            </h3>
            {isMultiColumn ? (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800 inline-flex items-center gap-1">
                <Columns className="w-3 h-3" />
                <span>{columns?.length} Vertical Lines</span>
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800">
                Single Column
              </span>
            )}
            <span
              className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800 font-mono"
              title="Rule: When performing addition, any 3-digit number has a decimal point placed after the first two digits (e.g., 333 as 33.3)"
            >
              Rule: 333 = 33.3
            </span>
          </div>

          {/* Current Date Display */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-1.5">
            <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>
              Date: <strong className="font-semibold text-slate-700 dark:text-slate-200">{dateInfo.fullDisplay}</strong>
            </span>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isMultiColumn
              ? "Multiple vertical columns added individually, then combined into a grand total."
              : "Calculates the exact vertical column sum automatically from the photo."}
          </p>
        </div>

        {/* Header Actions: View Toggle, Column Count, Export PDF, Excel, Copy, Share */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* View Mode Selector: Summarised, Matrix, Cards */}
          <div className="flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
            <button
              type="button"
              onClick={() => setMatrixViewMode("summary")}
              className={`px-2.5 py-1 rounded-md font-semibold inline-flex items-center gap-1 transition-all cursor-pointer ${
                matrixViewMode === "summary"
                  ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
              title="Summarised multiple column breakdown"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Summarised Only</span>
            </button>
            <button
              type="button"
              onClick={() => setMatrixViewMode("matrix")}
              className={`px-2.5 py-1 rounded-md font-semibold inline-flex items-center gap-1 transition-all cursor-pointer ${
                matrixViewMode === "matrix"
                  ? "bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
              title="Spreadsheet style side-by-side matrix table"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Matrix Grid</span>
            </button>
            <button
              type="button"
              onClick={() => setMatrixViewMode("cards")}
              className={`px-2.5 py-1 rounded-md font-semibold inline-flex items-center gap-1 transition-all cursor-pointer ${
                matrixViewMode === "cards"
                  ? "bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
              title="Individual vertical column cards"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Cards</span>
            </button>
          </div>

          {/* Column Layout Selector */}
          <div className="hidden sm:flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
            <span className="px-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Columns className="w-3 h-3 text-blue-500" />
              <span>Cols:</span>
            </span>
            {[2, 3, 4, 5, 8].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleSplitColumns(num)}
                className={`px-2 py-0.5 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                  activeColumns.length === num
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
                title={`Change result to ${num} multiple columns`}
              >
                {num}
              </button>
            ))}
          </div>

          {isMultiColumn && onUpdateColumns && (
            <button
              type="button"
              onClick={handleAddNewColumn}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Add another vertical column"
            >
              <Plus className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span className="hidden sm:inline">Add Column</span>
            </button>
          )}

          {/* Excel Actions */}
          <div className="inline-flex rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/40 p-0.5">
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isExportingExcel}
              className="px-2.5 py-1 rounded-md text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              title="Download Microsoft Excel spreadsheet (.xlsx)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Excel</span>
            </button>
            <button
              type="button"
              onClick={handleShareExcel}
              disabled={isSharingExcel}
              className="px-2 py-1 rounded-md text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
              title="Share Excel file via WhatsApp, Email, etc."
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* PDF Actions */}
          <div className="inline-flex rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/40 p-0.5">
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className="px-2.5 py-1 rounded-md text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              title="Download formatted PDF report (.pdf)"
            >
              <FileText className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
              <span>PDF</span>
            </button>
            <button
              type="button"
              onClick={handleSharePdf}
              disabled={isSharingPdf}
              className="px-2 py-1 rounded-md text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
              title="Share PDF report file via WhatsApp, Email, etc."
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handlePreviewPdf}
              className="px-1.5 py-1 rounded-md text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
              title="Preview / Print PDF in browser"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Copy calculation numbers to clipboard"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-emerald-700 dark:text-emerald-300 font-medium">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <span>Copy</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleShare}
            disabled={isSharing}
            className="px-2.5 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800/80 bg-blue-50/70 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            title="Share text summary"
          >
            {shareFeedback ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-emerald-700 dark:text-emerald-300 font-semibold">{shareFeedback}</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Share Text</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Calculation Stage */}
      <div className="p-5 sm:p-6 bg-slate-50/50 dark:bg-slate-950/40">
        {matrixViewMode === "summary" ? (
          /* Summarised Only View with Multiple Columns */
          <div className="space-y-6">
            {/* 1. Prominent Multi-Column Grand Summary Banner */}
            <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-indigo-900 via-blue-900 to-slate-900 text-white shadow-md border border-indigo-700/40">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="px-2.5 py-1 rounded-full bg-blue-500/30 text-blue-200 text-xs font-bold uppercase tracking-wider border border-blue-400/30 flex items-center gap-1.5">
                      <BarChart3 className="w-3.5 h-3.5" />
                      Multiple Column Summarised Result
                    </span>
                    <span
                      className="px-2.5 py-1 rounded-full bg-amber-400/20 text-amber-300 text-xs font-semibold border border-amber-300/30 font-mono"
                      title="Active rule: Any 3-digit number has a decimal point after first two digits (e.g. 333 = 33.3)"
                    >
                      Rule: 333 = 33.3
                    </span>
                    <span className="text-xs text-blue-200/80 font-mono">
                      {dateInfo.fullDisplay}
                    </span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                    {detectedTitle || "Measurement Chart Summary"}
                  </h2>
                  <p className="text-xs sm:text-sm text-blue-100/80 mt-1 max-w-xl">
                    {activeColumns.length} vertical lines summarized with verified 3-digit normalization.
                  </p>
                </div>

                {/* Grand Total Highlight Badge */}
                <div className="p-4 rounded-xl bg-white/10 backdrop-blur-xs border border-white/20 flex items-center justify-between lg:justify-end gap-6 shrink-0">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-blue-200 font-semibold mb-0.5">
                      Grand Total
                    </div>
                    <div className="text-3xl sm:text-4xl font-black font-mono text-white tracking-tight">
                      <AnimatedGrandTotal value={effectiveGrandTotal} showIndicator />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="px-3 py-2 rounded-lg bg-blue-500 hover:bg-blue-400 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    title="Copy summarized text to clipboard"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? "Copied" : "Copy Summary"}</span>
                  </button>
                </div>
              </div>

              {/* 4 Summary Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-white/10">
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <div className="text-[11px] text-blue-200/80 font-semibold uppercase tracking-wider">
                    Total Entries
                  </div>
                  <div className="text-2xl font-mono font-black text-white mt-0.5">
                    {summaryData.totalCount}
                  </div>
                  <div className="text-[10px] text-blue-300/70 mt-0.5">Counted items</div>
                </div>

                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <div className="text-[11px] text-blue-200/80 font-semibold uppercase tracking-wider">
                    Columns
                  </div>
                  <div className="text-2xl font-mono font-black text-white mt-0.5">
                    {summaryData.columnCount}
                  </div>
                  <div className="text-[10px] text-blue-300/70 mt-0.5">Vertical tallies</div>
                </div>

                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <div className="text-[11px] text-blue-200/80 font-semibold uppercase tracking-wider">
                    Average / Item
                  </div>
                  <div className="text-2xl font-mono font-black text-white mt-0.5">
                    {summaryData.average}
                  </div>
                  <div className="text-[10px] text-blue-300/70 mt-0.5">Mean per piece</div>
                </div>

                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <div className="text-[11px] text-blue-200/80 font-semibold uppercase tracking-wider">
                    Highest Column
                  </div>
                  <div className="text-2xl font-mono font-black text-emerald-300 mt-0.5 truncate">
                    {formatDisplayNumber(
                      summaryData.columns.length > 0 ? Math.max(...summaryData.columns.map((c) => c.sum)) : 0
                    )}
                  </div>
                  <div className="text-[10px] text-blue-300/70 mt-0.5">Max column subtotal</div>
                </div>
              </div>
            </div>

            {/* 2. Column Controls Bar: Change Number of Multiple Columns */}
            <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Columns className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Change Number of Columns:</span>
                </span>
                <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  {[2, 3, 4, 5, 8].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handleSplitColumns(num)}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                        activeColumns.length === num
                          ? "bg-blue-600 text-white shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      }`}
                      title={`Switch to ${num} multiple columns`}
                    >
                      {num} Columns
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMatrixViewMode("matrix")}
                  className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer inline-flex items-center gap-1"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>View Detailed Matrix</span>
                </button>
              </div>
            </div>

            {/* 3. Multiple Columns Summarised Comparison Table */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Multiple Columns Summary Table
                  </h4>
                </div>
                <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
                  {summaryData.columnCount} Vertical Lines
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 uppercase tracking-wider font-bold">
                      <th className="p-3 w-12 text-center">#</th>
                      <th className="p-3">Column Line</th>
                      <th className="p-3 text-center">Entries</th>
                      <th className="p-3 text-right">Subtotal Sum</th>
                      <th className="p-3 text-right">Average</th>
                      <th className="p-3 text-right">Share of Total</th>
                      <th className="p-3 text-center">Range (Min - Max)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {summaryData.columns.map((col, idx) => {
                      const vals = col.items.map((i) => i.value);
                      const minVal = vals.length > 0 ? Math.min(...vals) : 0;
                      const maxVal = vals.length > 0 ? Math.max(...vals) : 0;
                      return (
                        <tr
                          key={col.id}
                          className="hover:bg-blue-50/50 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <td className="p-3 font-mono text-center text-slate-400 font-semibold">
                            {idx + 1}
                          </td>
                          <td className="p-3 font-bold text-slate-800 dark:text-slate-200">
                            {col.title}
                          </td>
                          <td className="p-3 text-center font-mono font-semibold text-slate-600 dark:text-slate-400">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800">
                              {col.count}
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100 text-sm">
                            {formatDisplayNumber(col.sum)}
                          </td>
                          <td className="p-3 text-right font-mono text-slate-600 dark:text-slate-300">
                            {col.average}
                          </td>
                          <td className="p-3 text-right font-mono text-slate-500 dark:text-slate-400">
                            <div className="flex items-center justify-end gap-1.5">
                              <div className="w-12 bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="bg-indigo-600 h-full rounded-full"
                                  style={{ width: `${Math.min(col.percentage, 100)}%` }}
                                />
                              </div>
                              <span>{col.percentage}%</span>
                            </div>
                          </td>
                          <td className="p-3 text-center font-mono text-slate-500 dark:text-slate-400 text-[11px]">
                            {vals.length > 0 ? `${minVal} – ${maxVal}` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 dark:bg-slate-800 font-bold border-t-2 border-slate-300 dark:border-slate-600">
                      <td
                        colSpan={2}
                        className="p-3.5 text-slate-900 dark:text-white uppercase tracking-wider text-xs"
                      >
                        GRAND TOTAL ({summaryData.columnCount} COLUMNS)
                      </td>
                      <td className="p-3.5 text-center font-mono text-slate-900 dark:text-white text-sm">
                        {summaryData.totalCount} items
                      </td>
                      <td className="p-3.5 text-right font-mono font-black text-indigo-600 dark:text-indigo-400 text-base">
                        <AnimatedGrandTotal value={summaryData.grandTotal} showIndicator />
                      </td>
                      <td className="p-3.5 text-right font-mono text-slate-700 dark:text-slate-300">
                        {summaryData.average}
                      </td>
                      <td className="p-3.5 text-right font-mono text-slate-700 dark:text-slate-300">
                        100.0%
                      </td>
                      <td className="p-3.5 text-center text-slate-400 text-xs">
                        Verified
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* 4. Column Summary Cards Grid */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Column Breakdown Cards</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setMatrixViewMode("cards")}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-1"
                >
                  <span>View Number Lists</span>
                  <span>→</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {summaryData.columns.map((col) => (
                  <div
                    key={col.id}
                    className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs hover:border-blue-400 transition-all"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {col.title}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono font-semibold">
                        {col.count} items
                      </span>
                    </div>

                    <div className="font-mono text-2xl font-black text-slate-900 dark:text-slate-100 my-1">
                      {formatDisplayNumber(col.sum)}
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800 font-mono">
                      <span>
                        Avg: <strong>{col.average}</strong>
                      </span>
                      <span>
                        Share: <strong>{col.percentage}%</strong>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : matrixViewMode === "matrix" ? (
          <MeasurementChartMatrix
            columns={activeColumns}
            measurementMetadata={measurementMetadata}
            grandTotal={effectiveGrandTotal}
            grandFormula={effectiveGrandFormula}
            notes={localNotes || notes}
            calculationDate={calculationDate}
            onUpdateColumns={onUpdateColumns || (() => {})}
            onExportPdf={handleExportPdf}
            onSharePdf={handleSharePdf}
            onPreviewPdf={handlePreviewPdf}
            onExportExcel={handleExportExcel}
            onShareExcel={handleShareExcel}
            onCopy={handleCopy}
            copied={copied}
          />
        ) : isMultiColumn ? (
          <div className="space-y-6">
            {/* Multiple Vertical Columns side-by-side */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {activeColumns.map((col, idx) =>
                renderColumnCard(col.items, col.sum, col.title, col.formula, col.existingWrittenSum, idx)
              )}
            </div>

            {/* Prominent Combined Grand Total Final Result */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-900 via-blue-900 to-slate-900 dark:from-indigo-950 dark:via-blue-950 dark:to-slate-950 text-white shadow-md border border-indigo-800/30">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2.5 py-0.5 rounded-full bg-blue-500/30 text-blue-200 text-[11px] font-semibold uppercase tracking-wider border border-blue-400/30">
                      Combined Final Result
                    </span>
                    <span className="text-xs text-slate-300 dark:text-slate-400">
                      Sum of all {activeColumns.length} vertical lines
                    </span>
                  </div>
                  <div className="text-xs text-blue-200 dark:text-blue-300 font-mono mt-1">
                    {effectiveGrandFormula || activeColumns.map((c) => `${c.title} (${c.sum})`).join(" + ")}
                  </div>
                </div>

                <div className="text-right self-end sm:self-center">
                  <div className="text-[11px] uppercase tracking-wider text-slate-300 dark:text-slate-400 font-semibold mb-0.5">
                    Grand Total
                  </div>
                  <div className="text-3xl sm:text-4xl font-extrabold font-mono text-white tracking-tight">
                    <AnimatedGrandTotal value={effectiveGrandTotal} showIndicator />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center w-full">
            {/* Prominent Single Column Hero Result Banner */}
            <div className="w-full max-w-md mx-auto mb-4 p-4 rounded-2xl bg-gradient-to-br from-blue-700 via-indigo-700 to-slate-900 text-white shadow-md border border-blue-600/40">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded-full bg-white/20 text-white text-[11px] font-bold uppercase tracking-wider">
                      Calculation Result
                    </span>
                    <span className="text-xs text-blue-100/90">
                      {items.length} {items.length === 1 ? "number" : "numbers"} added
                    </span>
                  </div>
                  <div
                    className="text-xs text-blue-100 font-mono mt-0.5 truncate max-w-[200px] sm:max-w-xs"
                    title={items.map((it) => it.value).join(" + ") + " = " + sum}
                  >
                    {items.length > 0 ? items.map((it) => it.value).join(" + ") : "0"}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-[11px] uppercase tracking-wider text-blue-200 font-semibold mb-0.5">
                    Total Sum
                  </div>
                  <div className="text-3xl sm:text-4xl font-black font-mono text-white tracking-tight">
                    <AnimatedGrandTotal value={sum} showIndicator />
                  </div>
                </div>
              </div>
            </div>

            <div className="w-full max-w-md mx-auto">
              {renderColumnCard(
                items,
                sum,
                detectedTitle || "Vertical Column",
                items.map((it) => it.value).join(" + ") + " = " + sum,
                existingWrittenSum,
                0
              )}
            </div>
          </div>
        )}

        {/* Add Row Section */}
        <div className="mt-4 flex items-center justify-between">
          {!showAddRow ? (
            <button
              type="button"
              onClick={() => setShowAddRow(true)}
              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-semibold inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add number to {isMultiColumn ? "a vertical line" : "column"}</span>
            </button>
          ) : (
            <form onSubmit={handleAddNewItem} className="flex flex-wrap items-center gap-2 w-full max-w-md">
              {isMultiColumn && columns && (
                <select
                  value={targetColumnIndex}
                  onChange={(e) => setTargetColumnIndex(Number(e.target.value))}
                  className="text-xs px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500"
                >
                  {columns.map((col, idx) => (
                    <option key={col.id} value={idx}>
                      {col.title}
                    </option>
                  ))}
                </select>
              )}
              <input
                type="number"
                step="any"
                placeholder="Value (e.g. 15.5)"
                value={newRowValue}
                onChange={(e) => setNewRowValue(e.target.value)}
                className="text-xs px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg flex-1 min-w-[120px] bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500 font-mono"
                autoFocus
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium cursor-pointer"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setShowAddRow(false)}
                className="px-2 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              {formatNormalizedInputHint(newRowValue) && (
                <div className="w-full text-[11px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1 mt-1">
                  <span>⚡ 3-digit rule:</span>
                  <span className="font-mono font-bold">{formatNormalizedInputHint(newRowValue)}</span>
                </div>
              )}
            </form>
          )}

          <span className="text-[11px] text-slate-400 dark:text-slate-500 hidden sm:inline">
            Click any number to edit
          </span>
        </div>
      </div>

      {/* Professional Export & Share Hub */}
      <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl mx-4 sm:mx-6 my-4 border border-slate-700/60 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" />
              Professional Export &amp; Share
            </h4>
            <p className="text-[11px] text-slate-300 mt-0.5">
              Download or share official reports in Excel (.xlsx) and PDF with your calculation dates and notes.
            </p>
          </div>
          {shareFeedback && (
            <div className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-medium inline-flex items-center gap-1.5 animate-fade-in self-start sm:self-auto">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>{shareFeedback}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* 1. Download Excel */}
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={isExportingExcel}
            className="p-3 rounded-xl bg-emerald-600/90 hover:bg-emerald-500 text-white text-left transition-all border border-emerald-500/40 shadow-xs cursor-pointer group flex flex-col justify-between min-h-[78px] disabled:opacity-50"
          >
            <div className="flex items-center justify-between">
              <FileSpreadsheet className="w-5 h-5 text-emerald-200 group-hover:scale-110 transition-transform" />
              <Download className="w-3.5 h-3.5 text-emerald-200/80" />
            </div>
            <div>
              <div className="text-xs font-bold leading-tight">Download Excel</div>
              <div className="text-[10px] text-emerald-100/80">.xlsx Spreadsheet</div>
            </div>
          </button>

          {/* 2. Share Excel File */}
          <button
            type="button"
            onClick={handleShareExcel}
            disabled={isSharingExcel}
            className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-left transition-all border border-emerald-500/30 shadow-xs cursor-pointer group flex flex-col justify-between min-h-[78px] disabled:opacity-50"
          >
            <div className="flex items-center justify-between">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
              <Share2 className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div>
              <div className="text-xs font-bold leading-tight">Share Excel File</div>
              <div className="text-[10px] text-slate-400">WhatsApp / Email</div>
            </div>
          </button>

          {/* 3. Download PDF Report */}
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isExportingPdf}
            className="p-3 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white text-left transition-all border border-rose-500/40 shadow-xs cursor-pointer group flex flex-col justify-between min-h-[78px] disabled:opacity-50"
          >
            <div className="flex items-center justify-between">
              <FileText className="w-5 h-5 text-rose-200 group-hover:scale-110 transition-transform" />
              <Download className="w-3.5 h-3.5 text-rose-200/80" />
            </div>
            <div>
              <div className="text-xs font-bold leading-tight">Download PDF</div>
              <div className="text-[10px] text-rose-100/80">Printable Report</div>
            </div>
          </button>

          {/* 4. Share PDF File */}
          <button
            type="button"
            onClick={handleSharePdf}
            disabled={isSharingPdf}
            className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-left transition-all border border-rose-500/30 shadow-xs cursor-pointer group flex flex-col justify-between min-h-[78px] disabled:opacity-50"
          >
            <div className="flex items-center justify-between">
              <FileText className="w-5 h-5 text-rose-400 group-hover:scale-110 transition-transform" />
              <Share2 className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div>
              <div className="text-xs font-bold leading-tight">Share PDF File</div>
              <div className="text-[10px] text-slate-400">WhatsApp / Email</div>
            </div>
          </button>
        </div>

        {/* Secondary quick actions: Preview PDF & Copy Summary */}
        <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-slate-700/60 text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handlePreviewPdf}
              className="hover:text-white inline-flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5 text-blue-400" />
              <span>Preview PDF in Tab</span>
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={handleShare}
              className="hover:text-white inline-flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5 text-slate-400" />
              <span>Share Text Summary</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="hover:text-white inline-flex items-center gap-1 transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? "Copied" : "Copy Numbers"}</span>
          </button>
        </div>
      </div>

      {/* Notes / Transcription Summary & Remarks (Inline Editable, saved to session & PDF) */}
      <div className="p-4 bg-slate-50/80 dark:bg-slate-900/60 border-t border-slate-200/80 dark:border-slate-800 transition-colors">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Calculation Notes &amp; Remarks
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:inline">
              (saved to session &amp; included in PDF report)
            </span>
          </div>

          <div className="flex items-center gap-2">
            {notesSaveStatus && (
              <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1 transition-all">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{notesSaveStatus}</span>
              </span>
            )}

            {!isEditingNotes ? (
              <button
                type="button"
                onClick={handleStartEditingNotes}
                className="px-2.5 py-1 rounded-lg text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 inline-flex items-center gap-1.5 transition-colors cursor-pointer border border-transparent hover:border-blue-200 dark:hover:border-blue-800/60"
                title="Edit calculation notes"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{localNotes ? "Edit Note" : "Add Note"}</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSaveNotes()}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white inline-flex items-center gap-1 transition-colors cursor-pointer shadow-xs"
                  title="Save note to session and PDF"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLocalNotes(notes || "");
                    setIsEditingNotes(false);
                  }}
                  className="px-2 py-1 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Inline editable text field */}
        {isEditingNotes ? (
          <div className="space-y-2">
            <textarea
              ref={notesTextareaRef}
              value={localNotes}
              onChange={(e) => setLocalNotes(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleSaveNotes();
                }
              }}
              rows={3}
              placeholder="Enter custom remarks, invoice reference, store name, or line notes... (automatically saved to current session and printed in PDF report)"
              className="w-full text-xs p-3 rounded-xl border border-blue-400 dark:border-blue-500 bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none ring-2 ring-blue-500/20 resize-y transition-all font-sans leading-relaxed"
            />
            <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
              <span>Press <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-mono text-[10px] text-slate-700 dark:text-slate-300">Ctrl+Enter</kbd> to quickly save</span>
              <span>{localNotes.length} characters</span>
            </div>
          </div>
        ) : localNotes ? (
          <div
            onClick={handleStartEditingNotes}
            className="group relative p-3 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed cursor-pointer hover:border-blue-400 dark:hover:border-blue-600 transition-all shadow-xs"
            title="Click to edit notes"
          >
            <div>{localNotes}</div>
            <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity text-[11px] text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1 bg-blue-50/90 dark:bg-slate-900/90 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800">
              <Edit3 className="w-3 h-3" />
              <span>Edit</span>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleStartEditingNotes}
            className="w-full p-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer bg-white/40 dark:bg-slate-800/30"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add calculation note or remarks (saved to session &amp; included in PDF)</span>
          </button>
        )}
      </div>
    </div>
  );
};
