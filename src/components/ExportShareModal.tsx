import React, { useState } from "react";
import {
  X,
  Share2,
  FileText,
  FileSpreadsheet,
  Download,
  Copy,
  Check,
  Printer,
  ExternalLink,
  MessageCircle,
  Mail,
  Smartphone,
} from "lucide-react";
import {
  ExportDataOptions,
  sharePdfFile,
  shareExcelFile,
  exportToPdf,
  exportToExcel,
  previewPdf,
  getPdfFile,
  getExcelFile,
  saveOrDownloadBlob,
} from "../utils/export";

export interface ExportShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ExportDataOptions;
  defaultFormat?: "pdf" | "excel" | "both";
  onToast?: (message: string) => void;
}

export const ExportShareModal: React.FC<ExportShareModalProps> = ({
  isOpen,
  onClose,
  data,
  defaultFormat = "pdf",
  onToast,
}) => {
  const [activeTab, setActiveTab] = useState<"pdf" | "excel">(
    defaultFormat === "excel" ? "excel" : "pdf"
  );
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  const title = data.title || "Measurement Chart";
  const grandTotal = data.grandTotal ?? data.sum;
  const itemCount = data.items?.length || 0;
  const colCount = data.columns?.length || 1;

  // Build clean text representation for WhatsApp / Email / Clipboard
  const buildShareableText = () => {
    const lines: string[] = [
      `📊 ${title.toUpperCase()}`,
      `📅 Date: ${new Date(data.calculationDate || Date.now()).toLocaleDateString()}`,
      `📐 Total Hides / Items: ${itemCount}`,
      `✨ Grand Total: ${grandTotal}`,
      "",
    ];

    if (data.columns && data.columns.length > 0) {
      lines.push("--- COLUMN BREAKDOWN ---");
      data.columns.forEach((col, idx) => {
        lines.push(`Col ${idx + 1} (${col.title}): ${col.items.length} items, Sum = ${col.sum}`);
      });
      lines.push("");
    }

    if (data.notes) {
      lines.push(`Notes: ${data.notes}`);
    }

    lines.push("Generated with Measurement Chart App");
    return lines.join("\n");
  };

  const handleSystemShare = async () => {
    setIsProcessing(true);
    setFeedback(null);
    try {
      if (activeTab === "pdf") {
        const res = await sharePdfFile(data);
        if (res.success) {
          setFeedback(res.message);
          if (onToast) onToast(res.message);
        } else if (res.type !== "aborted") {
          // Fallback to text share
          if (typeof navigator !== "undefined" && navigator.share) {
            await navigator.share({
              title: `${title} PDF Report`,
              text: buildShareableText(),
            });
            setFeedback("Shared calculation summary via system dialog!");
          } else {
            setFeedback("System share not supported on this browser.");
          }
        }
      } else {
        const res = await shareExcelFile(data);
        if (res.success) {
          setFeedback(res.message);
          if (onToast) onToast(res.message);
        } else if (res.type !== "aborted") {
          // Fallback to text share
          if (typeof navigator !== "undefined" && navigator.share) {
            await navigator.share({
              title: `${title} Excel Spreadsheet`,
              text: buildShareableText(),
            });
            setFeedback("Shared calculation summary via system dialog!");
          } else {
            setFeedback("System share not supported on this browser.");
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("System share error:", err);
        setFeedback("Could not complete share dialog.");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    try {
      if (activeTab === "pdf") {
        const { blob, filename } = getPdfFile(data);
        const ok = saveOrDownloadBlob(blob, filename);
        const msg = ok ? `PDF file ${filename} downloaded to your device!` : "PDF download initiated.";
        setFeedback(msg);
        if (onToast) onToast(msg);
      } else {
        const { blob, filename } = getExcelFile(data);
        const ok = saveOrDownloadBlob(blob, filename);
        const msg = ok ? `Excel spreadsheet ${filename} downloaded to your device!` : "Excel download initiated.";
        setFeedback(msg);
        if (onToast) onToast(msg);
      }
    } catch (err) {
      console.error("Download error:", err);
      setFeedback("Download could not be initiated.");
    }
  };

  const handleWhatsAppShare = () => {
    try {
      const text = encodeURIComponent(buildShareableText());
      const whatsappUrl = `https://api.whatsapp.com/send?text=${text}`;
      const link = document.createElement("a");
      link.href = whatsappUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (document.body.contains(link)) document.body.removeChild(link);
      }, 2000);
      if (onToast) onToast("Opening WhatsApp with calculation breakdown...");
    } catch (_) {
      handleCopyClipboard();
      if (onToast) onToast("Summary copied to clipboard! Paste into WhatsApp.");
    }
  };

  const handleEmailShare = () => {
    try {
      const subject = encodeURIComponent(`${title} - Calculation Summary (Total: ${grandTotal})`);
      const body = encodeURIComponent(buildShareableText());
      const mailtoUrl = `mailto:?subject=${subject}&body=${body}`;
      const link = document.createElement("a");
      link.href = mailtoUrl;
      link.target = "_self";
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (document.body.contains(link)) document.body.removeChild(link);
      }, 2000);
      if (onToast) onToast("Opening email client...");
    } catch (_) {
      handleCopyClipboard();
    }
  };

  const handleCopyClipboard = async () => {
    try {
      const text = buildShareableText();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setFeedback("Calculation data copied to clipboard!");
      if (onToast) onToast("Calculation data copied to clipboard!");
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error("Copy error:", err);
      setFeedback("Could not access clipboard.");
    }
  };

  const handlePrintPdf = () => {
    try {
      previewPdf(data);
      if (onToast) onToast("Opening PDF preview / print dialog...");
    } catch (err) {
      console.error("Print error:", err);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-6 text-slate-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">
                Share & Export Report
              </h2>
              <p className="text-xs text-slate-400">
                Works 100% offline &bull; {colCount} col &bull; {itemCount} items &bull; Total:{" "}
                <span className="font-mono font-semibold text-indigo-300">{grandTotal}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Format Selector Tabs */}
        <div className="flex items-center gap-2 p-1 mt-4 bg-slate-800/80 rounded-xl border border-slate-700/60">
          <button
            type="button"
            onClick={() => setActiveTab("pdf")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "pdf"
                ? "bg-rose-600 text-white shadow-sm"
                : "text-slate-300 hover:text-white hover:bg-slate-700/50"
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>PDF Document (.pdf)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("excel")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "excel"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-300 hover:text-white hover:bg-slate-700/50"
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Excel Spreadsheet (.xlsx)</span>
          </button>
        </div>

        {/* Feedback Message */}
        {feedback && (
          <div className="mt-3 px-3.5 py-2 rounded-xl bg-slate-800 border border-indigo-500/40 text-indigo-300 text-xs font-medium flex items-center gap-2">
            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>{feedback}</span>
          </div>
        )}

        {/* Primary Action Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          {/* Option 1: Native System Share Sheet */}
          <button
            type="button"
            onClick={handleSystemShare}
            disabled={isProcessing}
            className={`p-3.5 rounded-xl border transition-all text-left flex items-start gap-3 cursor-pointer group ${
              activeTab === "pdf"
                ? "bg-rose-950/30 border-rose-800/60 hover:bg-rose-900/40 hover:border-rose-600"
                : "bg-emerald-950/30 border-emerald-800/60 hover:bg-emerald-900/40 hover:border-emerald-600"
            }`}
          >
            <div
              className={`p-2 rounded-lg ${
                activeTab === "pdf"
                  ? "bg-rose-600/30 text-rose-300 group-hover:bg-rose-600 group-hover:text-white"
                  : "bg-emerald-600/30 text-emerald-300 group-hover:bg-emerald-600 group-hover:text-white"
              } transition-colors`}
            >
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">
                Share via Apps (System Sheet)
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5 leading-tight">
                Send {activeTab.toUpperCase()} via WhatsApp, Gmail, Bluetooth, or Files
              </div>
            </div>
          </button>

          {/* Option 2: Direct File Download */}
          <button
            type="button"
            onClick={handleDownload}
            className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80 hover:bg-slate-750 hover:border-slate-600 transition-all text-left flex items-start gap-3 cursor-pointer group"
          >
            <div className="p-2 rounded-lg bg-blue-600/30 text-blue-300 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">
                Download {activeTab.toUpperCase()} File
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5 leading-tight">
                Saves directly to device Downloads folder (100% offline)
              </div>
            </div>
          </button>

          {/* Option 3: WhatsApp Direct */}
          <button
            type="button"
            onClick={handleWhatsAppShare}
            className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-800/40 hover:bg-emerald-900/30 hover:border-emerald-700 transition-all text-left flex items-start gap-3 cursor-pointer group"
          >
            <div className="p-2 rounded-lg bg-emerald-600/30 text-emerald-300 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <MessageCircle className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">
                Send to WhatsApp
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5 leading-tight">
                Opens WhatsApp with formatted table breakdown
              </div>
            </div>
          </button>

          {/* Option 4: Copy Table to Clipboard */}
          <button
            type="button"
            onClick={handleCopyClipboard}
            className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80 hover:bg-slate-750 hover:border-slate-600 transition-all text-left flex items-start gap-3 cursor-pointer group"
          >
            <div className="p-2 rounded-lg bg-indigo-600/30 text-indigo-300 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </div>
            <div>
              <div className="text-xs font-bold text-white">
                {copied ? "Copied to Clipboard!" : "Copy Data & Totals"}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5 leading-tight">
                Copies text breakdown ready to paste into any app
              </div>
            </div>
          </button>
        </div>

        {/* Secondary Actions */}
        <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-800 flex-wrap gap-2">
          {activeTab === "pdf" && (
            <button
              type="button"
              onClick={handlePrintPdf}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / View PDF</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleEmailShare}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Send via Email</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="ml-auto px-4 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
