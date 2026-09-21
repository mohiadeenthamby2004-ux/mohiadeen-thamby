import React, { useState } from "react";
import { DetectedNumberItem, VerticalColumnLine, MeasurementMetadata } from "../types";
import {
  FileSpreadsheet,
  FileText,
  Copy,
  Check,
  Building2,
  Calendar,
  Layers,
  Sparkles,
  Edit2,
  CheckCircle,
  Plus,
  Trash2,
  Share2,
  Eye,
  Download,
} from "lucide-react";
import { computeSafeSum, formatDisplayNumber, normalize3DigitValue } from "../utils/math";
import { AnimatedGrandTotal } from "./AnimatedGrandTotal";

interface MeasurementChartMatrixProps {
  columns: VerticalColumnLine[];
  measurementMetadata?: MeasurementMetadata;
  grandTotal?: number;
  grandFormula?: string;
  notes?: string;
  calculationDate?: Date | string | number;
  onUpdateColumns: (newColumns: VerticalColumnLine[]) => void;
  onExportPdf?: () => void;
  onSharePdf?: () => void;
  onPreviewPdf?: () => void;
  onExportExcel?: () => void;
  onShareExcel?: () => void;
  onCopy?: () => void;
  copied?: boolean;
}

export const MeasurementChartMatrix: React.FC<MeasurementChartMatrixProps> = ({
  columns,
  measurementMetadata,
  grandTotal,
  notes,
  calculationDate,
  onUpdateColumns,
  onExportPdf,
  onSharePdf,
  onPreviewPdf,
  onExportExcel,
  onShareExcel,
  onCopy,
  copied,
}) => {
  const [editingCell, setEditingCell] = useState<{ colIdx: number; itemIdx: number } | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);

  const totalPieces = columns.reduce((acc, col) => acc + (col.items?.length || 0), 0);
  const calculatedGrandTotal = grandTotal ?? computeSafeSum(columns.map((c) => c.sum)).sum;

  const isTannery = Boolean(
    measurementMetadata?.companyName?.toUpperCase().includes("EVERWIN") ||
    measurementMetadata?.documentTitle?.toUpperCase().includes("MEASUREMENT LIST") ||
    measurementMetadata?.article
  );

  const unitLabel = measurementMetadata?.unit || (isTannery ? "Sq' Ft" : "");
  const piecesLabel = isTannery ? "hides" : "entries";

  // Find max rows across all columns: only use 30 if full page tannery sheet
  const maxDataRows = Math.max(...columns.map((c) => c.items?.length || 0), 1);
  const maxRows = isTannery ? Math.max(maxDataRows, 30) : maxDataRows;
  const averageValue = totalPieces > 0 ? (calculatedGrandTotal / totalPieces).toFixed(2) : "0.00";

  const handleStartEdit = (colIdx: number, itemIdx: number, currentVal: number) => {
    setEditingCell({ colIdx, itemIdx });
    setEditValue(currentVal.toString());
  };

  const handleSaveEdit = () => {
    if (!editingCell) return;
    const { colIdx, itemIdx } = editingCell;
    const parsed = normalize3DigitValue(editValue);

    if (!isNaN(parsed) && parsed >= 0) {
      const updated = columns.map((col, cIdx) => {
        if (cIdx !== colIdx) return col;

        const newItems = col.items.map((item, iIdx) => {
          if (iIdx !== itemIdx) return item;
          return {
            ...item,
            value: parsed,
            rawText: parsed.toString(),
          };
        });

        const newSum = computeSafeSum(newItems).sum;
        const newFormula = newItems.map((i) => i.value).join(" + ") + " = " + newSum;
        return {
          ...col,
          items: newItems,
          sum: newSum,
          formula: newFormula,
        };
      });

      onUpdateColumns(updated);
    }

    setEditingCell(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveEdit();
    } else if (e.key === "Escape") {
      setEditingCell(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Industrial Document Header Banner */}
      <div className="rounded-2xl p-5 bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white shadow-md border border-emerald-800/40">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/30 text-emerald-200 border border-emerald-400/30 text-xs font-semibold uppercase tracking-wider flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" />
                {isTannery ? "Leather Measurement List" : "Measurement Chart Matrix"}
              </span>
              <span className="text-xs text-emerald-200/80 font-mono">
                {measurementMetadata?.date ? `Date: ${measurementMetadata.date}` : "Verified Sheet"}
              </span>
              <span
                className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 font-mono"
                title="Rule active: When performing addition, any 3-digit number has a decimal point placed after the first two digits (e.g., 333 as 33.3)"
              >
                Rule: 3-digit (e.g. 333 = 33.3)
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              {measurementMetadata?.companyName || "Measurement Chart Matrix"}
            </h2>
            <p className="text-xs sm:text-sm text-emerald-100/80 mt-1 flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-emerald-300">
                {measurementMetadata?.documentTitle || "MULTIPLE COLUMNS CALCULATION"}
              </span>
              {measurementMetadata?.article && (
                <>
                  <span>•</span>
                  <span>Article: <strong>{measurementMetadata.article}</strong></span>
                </>
              )}
              <span>•</span>
              <span>{columns.length} Columns ({totalPieces} {piecesLabel})</span>
            </p>
          </div>

          {/* Quick Export & Actions */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {/* Excel Actions */}
            <div className="inline-flex rounded-xl bg-emerald-950/80 p-0.5 border border-emerald-700/60 shadow-xs">
              {onExportExcel && (
                <button
                  type="button"
                  onClick={onExportExcel}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Download Excel spreadsheet (.xlsx)"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Excel</span>
                </button>
              )}
              {onShareExcel && (
                <button
                  type="button"
                  onClick={onShareExcel}
                  className="px-2 py-1.5 rounded-lg hover:bg-emerald-800/70 text-emerald-200 text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                  title="Share Excel file via WhatsApp, Email, or Bluetooth"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Share</span>
                </button>
              )}
            </div>

            {/* PDF Actions */}
            <div className="inline-flex rounded-xl bg-slate-900/90 p-0.5 border border-slate-700/80 shadow-xs">
              {onExportPdf && (
                <button
                  type="button"
                  onClick={onExportPdf}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Download PDF report (.pdf)"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>PDF</span>
                </button>
              )}
              {onSharePdf && (
                <button
                  type="button"
                  onClick={onSharePdf}
                  className="px-2 py-1.5 rounded-lg hover:bg-slate-800 text-rose-200 text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                  title="Share PDF report file via WhatsApp, Email, or Bluetooth"
                >
                  <Share2 className="w-3.5 h-3.5 text-rose-300" />
                  <span className="hidden sm:inline">Share</span>
                </button>
              )}
              {onPreviewPdf && (
                <button
                  type="button"
                  onClick={onPreviewPdf}
                  className="px-2 py-1.5 rounded-lg hover:bg-slate-800 text-slate-300 text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                  title="Preview / Print PDF in browser tab"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {onCopy && (
              <button
                type="button"
                onClick={onCopy}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 border border-slate-700 transition-colors shadow-sm cursor-pointer"
                title="Copy full matrix numbers to clipboard"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-300" />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            )}
          </div>
        </div>

        {/* 4 Prominent Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-emerald-800/60">
          <div className="bg-emerald-950/60 rounded-xl p-3 border border-emerald-700/40">
            <div className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider">
              Total Count
            </div>
            <div className="font-mono text-2xl font-black text-white mt-0.5">
              {totalPieces}
            </div>
            <div className="text-[10px] text-emerald-300/80 mt-0.5">{piecesLabel} counted</div>
          </div>

          <div className="bg-emerald-950/60 rounded-xl p-3 border border-emerald-700/40">
            <div className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider">
              Grand Total {unitLabel ? `(${unitLabel})` : ""}
            </div>
            <div className="font-mono text-2xl font-black text-emerald-300 mt-0.5">
              <AnimatedGrandTotal value={calculatedGrandTotal} showIndicator />
            </div>
            <div className="text-[10px] text-emerald-300/80 mt-0.5">Combined sum</div>
          </div>

          <div className="bg-emerald-950/60 rounded-xl p-3 border border-emerald-700/40">
            <div className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider">
              Average
            </div>
            <div className="font-mono text-2xl font-black text-white mt-0.5">
              {averageValue}
            </div>
            <div className="text-[10px] text-emerald-300/80 mt-0.5">Per {piecesLabel.slice(0, -1) || "item"}</div>
          </div>

          <div className="bg-emerald-950/60 rounded-xl p-3 border border-emerald-700/40">
            <div className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider">
              Columns
            </div>
            <div className="font-mono text-2xl font-black text-white mt-0.5">
              {columns.length}
            </div>
            <div className="text-[10px] text-emerald-300/80 mt-0.5">Vertical tallies</div>
          </div>
        </div>
      </div>

      {/* Shorthand Notation Guide */}
      <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200/80 dark:border-amber-900/40 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>
            <strong>Industrial Shorthand Handled:</strong> Numbers with trailing hyphens (e.g.{" "}
            <code className="bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded font-mono font-bold">25-</code>,{" "}
            <code className="bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded font-mono font-bold">21-</code>) represent exact whole square feet (25.0, 21.0). Row number columns (1-30) are excluded from summation.
          </span>
        </div>
        <div className="text-[11px] text-amber-800/80 dark:text-amber-300/80">
          Click any cell to edit value
        </div>
      </div>

      {/* Side-by-Side Matrix Grid Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
              Measurement List Matrix (8 Columns Side-by-Side)
            </h3>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Scroll horizontally to view all sections
          </span>
        </div>

        <div className="overflow-x-auto max-h-[580px] overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            {/* Table Header with Section & Column info */}
            <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 z-10 shadow-xs">
              <tr>
                <th className="p-2.5 font-bold text-slate-500 dark:text-slate-400 w-12 text-center border-b border-r border-slate-200 dark:border-slate-700 bg-slate-200/80 dark:bg-slate-800">
                  #
                </th>
                {columns.map((col, colIdx) => (
                  <th
                    key={col.id}
                    onMouseEnter={() => setHoveredCol(colIdx)}
                    onMouseLeave={() => setHoveredCol(null)}
                    className={`p-2.5 font-bold border-b border-r border-slate-200 dark:border-slate-700 min-w-[100px] transition-colors ${
                      hoveredCol === colIdx
                        ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200"
                        : "text-slate-800 dark:text-slate-200"
                    }`}
                  >
                    <div className="font-semibold text-[11px] truncate">{col.title}</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
                      {col.items.length} items
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Table Body: Rows 1 to maxRows */}
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
              {Array.from({ length: maxRows }).map((_, rIdx) => {
                const isRowHovered = hoveredRow === rIdx;
                return (
                  <tr
                    key={rIdx}
                    onMouseEnter={() => setHoveredRow(rIdx)}
                    onMouseLeave={() => setHoveredRow(null)}
                    className={`transition-colors ${
                      isRowHovered
                        ? "bg-slate-100/70 dark:bg-slate-800/60"
                        : rIdx % 2 === 0
                        ? "bg-white dark:bg-slate-900"
                        : "bg-slate-50/50 dark:bg-slate-900/40"
                    }`}
                  >
                    {/* Sticky Row Index */}
                    <td className="p-2 text-center font-bold text-slate-400 dark:text-slate-500 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 select-none">
                      {rIdx + 1}
                    </td>

                    {/* Column Cells */}
                    {columns.map((col, cIdx) => {
                      const item = col.items[rIdx];
                      const isCellEditing = editingCell?.colIdx === cIdx && editingCell?.itemIdx === rIdx;
                      const isCellHighlighted = hoveredCol === cIdx || isRowHovered;

                      if (!item) {
                        return (
                          <td
                            key={col.id}
                            className={`p-2 border-r border-slate-100 dark:border-slate-800/80 text-center text-slate-300 dark:text-slate-700 ${
                              isCellHighlighted ? "bg-emerald-50/20 dark:bg-emerald-950/20" : ""
                            }`}
                          >
                            —
                          </td>
                        );
                      }

                      if (isCellEditing) {
                        return (
                          <td key={col.id} className="p-1 border-r border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50">
                            <input
                              type="number"
                              step="0.1"
                              autoFocus
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={handleSaveEdit}
                              onKeyDown={handleKeyDown}
                              className="w-full px-2 py-1 bg-white dark:bg-slate-800 border border-emerald-500 rounded text-xs font-mono font-bold text-emerald-700 dark:text-emerald-300 outline-none shadow-xs"
                            />
                          </td>
                        );
                      }

                      return (
                        <td
                          key={col.id}
                          onClick={() => handleStartEdit(cIdx, rIdx, item.value)}
                          className={`p-2 text-right border-r border-slate-100 dark:border-slate-800/80 cursor-pointer group select-none transition-colors ${
                            isCellHighlighted
                              ? "bg-emerald-50/40 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200"
                              : "text-slate-900 dark:text-slate-100"
                          }`}
                          title={`Row ${rIdx + 1}, ${col.title}: ${item.value} Sq' Ft (Click to edit)`}
                        >
                          <div className="flex items-center justify-end gap-1">
                            <span className="font-semibold text-xs">{formatDisplayNumber(item.value)}</span>
                            <Edit2 className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 text-slate-400" />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>

            {/* Table Footer: Column Sums and Counts */}
            <tfoot className="sticky bottom-0 bg-slate-100 dark:bg-slate-800 font-mono font-bold border-t-2 border-slate-300 dark:border-slate-700 shadow-md">
              {/* Column Totals Row */}
              <tr>
                <td className="p-2.5 text-center text-[11px] uppercase tracking-wider text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 bg-slate-200/90 dark:bg-slate-800">
                  Total
                </td>
                {columns.map((col) => (
                  <td
                    key={col.id}
                    className="p-2.5 text-right text-xs font-black text-emerald-700 dark:text-emerald-300 border-r border-slate-200 dark:border-slate-700"
                  >
                    {formatDisplayNumber(col.sum)}
                  </td>
                ))}
              </tr>

              {/* Pieces Row */}
              <tr className="bg-slate-50 dark:bg-slate-800/70 text-[10px]">
                <td className="p-2 text-center text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700 capitalize">
                  {piecesLabel}
                </td>
                {columns.map((col) => (
                  <td
                    key={col.id}
                    className="p-2 text-right text-slate-600 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700"
                  >
                    {col.items?.length || 0} pcs
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Grand Total Footer Bar */}
        <div className="p-4 bg-slate-900 text-white flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            <div>
              <div className="text-xs text-slate-300">
                Verified Combined Column Total
              </div>
              <div className="text-xs text-emerald-400 font-mono">
                {columns.map((c) => `${formatDisplayNumber(c.sum)}`).join(" + ")} = {formatDisplayNumber(calculatedGrandTotal)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider">
                {isTannery ? "Total Leather Area:" : "Grand Total:"}
              </span>
              <div className="text-xl font-extrabold text-emerald-400 font-mono">
                <AnimatedGrandTotal
                  value={calculatedGrandTotal}
                  suffix={unitLabel ? ` ${unitLabel}` : undefined}
                  showIndicator
                />
              </div>
            </div>
            <div className="text-right border-l border-slate-700 pl-4">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider">Total Count:</span>
              <div className="text-xl font-extrabold text-white font-mono">
                {totalPieces} {piecesLabel}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
