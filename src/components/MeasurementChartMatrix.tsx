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
} from "lucide-react";
import { computeSafeSum } from "../utils/math";

interface MeasurementChartMatrixProps {
  columns: VerticalColumnLine[];
  measurementMetadata?: MeasurementMetadata;
  grandTotal?: number;
  grandFormula?: string;
  notes?: string;
  calculationDate?: Date | string | number;
  onUpdateColumns: (newColumns: VerticalColumnLine[]) => void;
  onExportPdf?: () => void;
  onExportExcel?: () => void;
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
  onExportExcel,
  onCopy,
  copied,
}) => {
  const [editingCell, setEditingCell] = useState<{ colIdx: number; itemIdx: number } | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);

  const totalPieces = columns.reduce((acc, col) => acc + col.items.length, 0);
  const calculatedGrandTotal = grandTotal ?? computeSafeSum(columns.map((c) => c.sum)).sum;
  const averageSqFt = totalPieces > 0 ? (calculatedGrandTotal / totalPieces).toFixed(2) : "0.00";

  // Find max rows across all columns (typically up to 30)
  const maxRows = Math.max(...columns.map((c) => c.items.length), 30);

  const handleStartEdit = (colIdx: number, itemIdx: number, currentVal: number) => {
    setEditingCell({ colIdx, itemIdx });
    setEditValue(currentVal.toString());
  };

  const handleSaveEdit = () => {
    if (!editingCell) return;
    const { colIdx, itemIdx } = editingCell;
    const parsed = parseFloat(editValue);

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
                Industrial Measurement Chart
              </span>
              <span className="text-xs text-emerald-200/80 font-mono">
                {measurementMetadata?.date ? `Date: ${measurementMetadata.date}` : "Full Page Sheet"}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              {measurementMetadata?.companyName || "EVERWIN TANNERS - MELVISHARAM"}
            </h2>
            <p className="text-xs sm:text-sm text-emerald-100/80 mt-1 flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-emerald-300">
                {measurementMetadata?.documentTitle || "MEASUREMENT LIST"}
              </span>
              {measurementMetadata?.article && (
                <>
                  <span>•</span>
                  <span>Article: <strong>{measurementMetadata.article}</strong></span>
                </>
              )}
              <span>•</span>
              <span>8 Columns across 3 Sections</span>
            </p>
          </div>

          {/* Quick Export & Actions */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {onExportExcel && (
              <button
                type="button"
                onClick={onExportExcel}
                className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                title="Download Excel spreadsheet with full measurement matrix"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Export Matrix (Excel)</span>
              </button>
            )}
            {onExportPdf && (
              <button
                type="button"
                onClick={onExportPdf}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 border border-slate-700 transition-colors shadow-sm cursor-pointer"
                title="Download PDF report"
              >
                <FileText className="w-4 h-4 text-rose-400" />
                <span>PDF</span>
              </button>
            )}
            {onCopy && (
              <button
                type="button"
                onClick={onCopy}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 border border-slate-700 transition-colors shadow-sm cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-300" />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            )}
          </div>
        </div>

        {/* 3 Prominent Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-emerald-800/60">
          <div className="bg-emerald-950/60 rounded-xl p-3 border border-emerald-700/40">
            <div className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider">
              Total Pieces / Hides
            </div>
            <div className="font-mono text-2xl font-black text-white mt-0.5">
              {totalPieces}
            </div>
            <div className="text-[10px] text-emerald-300/80 mt-0.5">Hides measured</div>
          </div>

          <div className="bg-emerald-950/60 rounded-xl p-3 border border-emerald-700/40">
            <div className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider">
              Total Sq. Ft.
            </div>
            <div className="font-mono text-2xl font-black text-emerald-300 mt-0.5">
              {calculatedGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </div>
            <div className="text-[10px] text-emerald-300/80 mt-0.5">Total leather area</div>
          </div>

          <div className="bg-emerald-950/60 rounded-xl p-3 border border-emerald-700/40">
            <div className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider">
              Average Area
            </div>
            <div className="font-mono text-2xl font-black text-white mt-0.5">
              {averageSqFt}
            </div>
            <div className="text-[10px] text-emerald-300/80 mt-0.5">Sq&apos; Ft per hide</div>
          </div>

          <div className="bg-emerald-950/60 rounded-xl p-3 border border-emerald-700/40">
            <div className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider">
              Full Page Columns
            </div>
            <div className="font-mono text-2xl font-black text-white mt-0.5">
              {columns.length}
            </div>
            <div className="text-[10px] text-emerald-300/80 mt-0.5">3 Section layout</div>
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
                            <span className="font-semibold text-xs">{item.value.toFixed(1)}</span>
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
                    {col.sum.toFixed(1)}
                  </td>
                ))}
              </tr>

              {/* Pieces Row */}
              <tr className="bg-slate-50 dark:bg-slate-800/70 text-[10px]">
                <td className="p-2 text-center text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700">
                  Hides
                </td>
                {columns.map((col) => (
                  <td
                    key={col.id}
                    className="p-2 text-right text-slate-600 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700"
                  >
                    {col.items.length} pcs
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
                Verified Full-Page Measurement Total
              </div>
              <div className="text-xs text-emerald-400 font-mono">
                {columns.map((c) => `${c.sum.toFixed(1)}`).join(" + ")} = {calculatedGrandTotal.toFixed(1)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider">Total Leather Area:</span>
              <div className="text-xl font-extrabold text-emerald-400 font-mono">
                {calculatedGrandTotal.toFixed(1)} Sq&apos; Ft
              </div>
            </div>
            <div className="text-right border-l border-slate-700 pl-4">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider">Total Pieces:</span>
              <div className="text-xl font-extrabold text-white font-mono">
                {totalPieces} hides
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
