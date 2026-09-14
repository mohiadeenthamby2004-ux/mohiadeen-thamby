import React, { useState, useEffect, useRef } from "react";
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
} from "lucide-react";
import { formatVerticalColumn, computeSafeSum } from "../utils/math";
import { shareCalculation } from "../utils/share";
import { exportToPdf, exportToExcel, formatCurrentDateTime } from "../utils/export";
import { MeasurementChartMatrix } from "./MeasurementChartMatrix";

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
}) => {
  const isFullPageMeasurementChart = Boolean(
    isMeasurementChart ||
    measurementMetadata?.isMeasurementChart ||
    (columns && columns.length >= 4)
  );

  const [matrixViewMode, setMatrixViewMode] = useState<"matrix" | "cards">(
    isFullPageMeasurementChart ? "matrix" : "cards"
  );
  const [copied, setCopied] = useState<boolean>(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);
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

  const isMultiColumn = Array.isArray(columns) && columns.length > 1;
  const dateInfo = formatCurrentDateTime(calculationDate);

  // Multi-column copy or single-column copy
  const handleCopy = () => {
    let text = "";
    if (isMultiColumn && columns) {
      text = columns
        .map((col) => `${col.title}:\n` + formatVerticalColumn(col.items, col.sum))
        .join("\n\n");
      if (typeof grandTotal === "number") {
        text += `\n\n====================\nGRAND TOTAL = ${grandTotal}`;
        if (grandFormula) {
          text += ` (${grandFormula})`;
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
        sum,
        columns,
        grandTotal,
        grandFormula,
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

  // Handle Export to PDF
  const handleExportPdf = () => {
    setIsExportingPdf(true);
    try {
      const success = exportToPdf({
        title: detectedTitle || "Vertical Addition Result",
        items,
        sum,
        columns,
        grandTotal,
        grandFormula,
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

  // Handle Export to Excel
  const handleExportExcel = () => {
    setIsExportingExcel(true);
    try {
      const success = exportToExcel({
        title: detectedTitle || "Vertical Addition Result",
        items,
        sum,
        columns,
        grandTotal,
        grandFormula,
        existingWrittenSum,
        notes: localNotes || notes,
        calculationDate,
        measurementMetadata,
        isMeasurementChart: isFullPageMeasurementChart,
      });
      if (success && onExportSuccess) {
        onExportSuccess("Excel spreadsheet downloaded successfully!");
      }
    } catch (err) {
      console.error("Excel export error:", err);
    } finally {
      setIsExportingExcel(false);
    }
  };

  // Update item value in single or multi column mode
  const handleValueChange = (id: string, valStr: string) => {
    const parsed = parseFloat(valStr);
    const numericVal = isNaN(parsed) ? 0 : parsed;

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
    const val = parseFloat(newRowValue);
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
        className="flex-1 min-w-[280px] bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between overflow-hidden"
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
                <span>Verified with written total: <strong>{colWrittenSum}</strong></span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Written: {colWrittenSum} • Calculated: {colSum}</span>
              </>
            )}
          </div>
        )}

        {/* Numbers Stack */}
        <div className="p-4 flex-1 font-mono">
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
                        {item.value}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summation line */}
          <div className="my-2.5 border-b-2 border-slate-800 dark:border-slate-300" />

          {/* Line Final Result */}
          <div className="flex items-center justify-between px-3 py-2 bg-blue-50/80 dark:bg-blue-950/40 rounded-lg border border-blue-100 dark:border-blue-900/60">
            <div className="text-[11px] font-sans font-bold text-blue-900 dark:text-blue-200 uppercase tracking-wider">
              {isMultiColumn ? `${colTitle} Result` : "Total Sum"}
            </div>
            <div className="font-mono text-2xl font-extrabold text-blue-700 dark:text-blue-300 tracking-tight">
              {colSum}
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

        {/* Header Actions: View Toggle, Export PDF, Excel, Copy, Share */}
        <div className="flex items-center gap-2 flex-wrap">
          {isMultiColumn && (
            <div className="flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
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
          )}

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

          {/* Export to PDF button */}
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isExportingPdf}
            className="px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            title="Download formatted PDF report with calculation details and date"
          >
            <FileText className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
            <span>PDF</span>
          </button>

          {/* Export to Excel button */}
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={isExportingExcel}
            className="px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            title="Download Microsoft Excel spreadsheet (.xlsx)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Excel</span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Copy vertical addition formula"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-emerald-700 dark:text-emerald-300">Copied!</span>
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
            title="Share calculation results via Web Share API"
          >
            {shareFeedback ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-emerald-700 dark:text-emerald-300 font-semibold">{shareFeedback}</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Share</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Calculation Stage */}
      <div className="p-5 sm:p-6 bg-slate-50/50 dark:bg-slate-950/40">
        {isMultiColumn && columns ? (
          matrixViewMode === "matrix" ? (
            <MeasurementChartMatrix
              columns={columns}
              measurementMetadata={measurementMetadata}
              grandTotal={grandTotal}
              grandFormula={grandFormula}
              notes={localNotes || notes}
              calculationDate={calculationDate}
              onUpdateColumns={onUpdateColumns || (() => {})}
              onExportPdf={handleExportPdf}
              onExportExcel={handleExportExcel}
              onCopy={handleCopy}
              copied={copied}
            />
          ) : (
            <div className="space-y-6">
              {/* Multiple Vertical Columns side-by-side */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {columns.map((col, idx) =>
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
                        Sum of all {columns.length} vertical lines
                      </span>
                    </div>
                    <div className="text-xs text-blue-200 dark:text-blue-300 font-mono mt-1">
                      {grandFormula || columns.map((c) => `${c.title} (${c.sum})`).join(" + ")}
                    </div>
                  </div>

                  <div className="text-right self-end sm:self-center">
                    <div className="text-[11px] uppercase tracking-wider text-slate-300 dark:text-slate-400 font-semibold mb-0.5">
                      Grand Total
                    </div>
                    <div className="text-3xl sm:text-4xl font-extrabold font-mono text-white tracking-tight">
                      {grandTotal ?? sum}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        ) : (
          <div className="flex flex-col items-center">
            {renderColumnCard(
              items,
              sum,
              detectedTitle || "Vertical Column",
              items.map((it) => it.value).join(" + ") + " = " + sum,
              existingWrittenSum,
              0
            )}
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
            </form>
          )}

          <span className="text-[11px] text-slate-400 dark:text-slate-500 hidden sm:inline">
            Click any number to edit
          </span>
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
