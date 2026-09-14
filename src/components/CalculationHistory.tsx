import React, { useState } from "react";
import { HistoryRecord } from "../types";
import { History, Trash2, ArrowRight, Share2, Check, FileText, FileSpreadsheet, Calendar } from "lucide-react";
import { shareCalculation } from "../utils/share";
import { exportToPdf, exportToExcel, formatCurrentDateTime } from "../utils/export";

interface CalculationHistoryProps {
  history: HistoryRecord[];
  onSelectRecord: (record: HistoryRecord) => void;
  onClearHistory: () => void;
  onShareSuccess?: (msg: string) => void;
}

export const CalculationHistory: React.FC<CalculationHistoryProps> = ({
  history,
  onSelectRecord,
  onClearHistory,
  onShareSuccess,
}) => {
  const [sharedId, setSharedId] = useState<string | null>(null);

  if (history.length === 0) {
    return null;
  }

  const handleShareItem = async (e: React.MouseEvent, rec: HistoryRecord) => {
    e.stopPropagation();
    const res = await shareCalculation({
      title: rec.title,
      items: rec.items,
      sum: rec.sum,
      columns: rec.columns,
      grandTotal: rec.grandTotal,
      imageSrc: rec.thumbnail,
    });

    if (res.success) {
      setSharedId(rec.id);
      setTimeout(() => setSharedId(null), 2000);
      if (onShareSuccess) {
        onShareSuccess(
          res.type === "clipboard" ? "Calculation copied to clipboard!" : "Calculation shared!"
        );
      }
    }
  };

  const handleExportPdfItem = (e: React.MouseEvent, rec: HistoryRecord) => {
    e.stopPropagation();
    const success = exportToPdf({
      title: rec.title,
      items: rec.items,
      sum: rec.sum,
      columns: rec.columns,
      grandTotal: rec.grandTotal,
      imageSrc: rec.thumbnail,
      notes: rec.notes,
      calculationDate: rec.timestamp,
    });
    if (success && onShareSuccess) {
      onShareSuccess("PDF downloaded for this calculation!");
    }
  };

  const handleExportExcelItem = (e: React.MouseEvent, rec: HistoryRecord) => {
    e.stopPropagation();
    const success = exportToExcel({
      title: rec.title,
      items: rec.items,
      sum: rec.sum,
      columns: rec.columns,
      grandTotal: rec.grandTotal,
      notes: rec.notes,
      calculationDate: rec.timestamp,
    });
    if (success && onShareSuccess) {
      onShareSuccess("Excel downloaded for this calculation!");
    }
  };

  return (
    <div className="w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden mt-6">
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Recent Scans &amp; Calculations</h4>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
            {history.length}
          </span>
        </div>

        <button
          type="button"
          onClick={onClearHistory}
          className="text-xs text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 p-1 rounded transition-colors inline-flex items-center gap-1 cursor-pointer"
          title="Clear scan history"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Clear</span>
        </button>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
        {history.map((rec) => {
          const itemDate = formatCurrentDateTime(rec.timestamp);

          return (
            <div
              key={rec.id}
              onClick={() => onSelectRecord(rec)}
              className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 flex items-center justify-between cursor-pointer transition-colors group"
            >
              <div className="flex items-center gap-3 min-w-0">
                {rec.thumbnail ? (
                  <img
                    src={rec.thumbnail}
                    alt={rec.title}
                    className="w-10 h-10 object-cover rounded-lg border border-slate-200 dark:border-slate-700 shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900/60 flex items-center justify-center text-blue-700 dark:text-blue-300 font-bold font-mono text-xs shrink-0">
                    Σ
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                    {rec.title}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                    <span>{itemDate.fullDisplay}</span>
                    <span className="text-slate-300 dark:text-slate-600">•</span>
                    <span>{rec.items.length} items</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 ml-3">
                <div className="text-right">
                  <div className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100">
                    {rec.sum}
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono hidden sm:block">
                    {rec.items.map((i) => i.value).slice(0, 3).join("+")}
                    {rec.items.length > 3 ? "..." : ""}
                  </div>
                </div>

                {/* PDF export for history item */}
                <button
                  type="button"
                  onClick={(e) => handleExportPdfItem(e, rec)}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-white dark:hover:bg-slate-800 hover:border-rose-300 dark:hover:border-rose-700 transition-colors cursor-pointer"
                  title="Export this record to PDF"
                >
                  <FileText className="w-3.5 h-3.5" />
                </button>

                {/* Excel export for history item */}
                <button
                  type="button"
                  onClick={(e) => handleExportExcelItem(e, rec)}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-white dark:hover:bg-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors cursor-pointer"
                  title="Export this record to Excel (.xlsx)"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                </button>

                {/* Quick Share Button for this item */}
                <button
                  type="button"
                  onClick={(e) => handleShareItem(e, rec)}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-white dark:hover:bg-slate-800 hover:border-blue-300 dark:hover:border-blue-600 transition-colors cursor-pointer"
                  title="Share this calculation"
                >
                  {sharedId === rec.id ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Share2 className="w-3.5 h-3.5" />
                  )}
                </button>

                <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
