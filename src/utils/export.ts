import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import { DetectedNumberItem, VerticalColumnLine, MeasurementMetadata } from "../types";
import { formatDisplayNumber } from "./math";

export interface ExportDataOptions {
  title: string;
  items: DetectedNumberItem[];
  sum: number;
  columns?: VerticalColumnLine[];
  grandTotal?: number;
  grandFormula?: string;
  existingWrittenSum?: number | null;
  notes?: string;
  imageSrc?: string | null;
  calculationDate?: Date | string | number;
  measurementMetadata?: MeasurementMetadata;
  isMeasurementChart?: boolean;
}

export interface ShareFileResult {
  success: boolean;
  type: "native_share" | "downloaded_fallback" | "clipboard_fallback" | "aborted" | "error";
  message: string;
}

/**
 * Formats current date and time nicely for UI and export reports
 */
export function formatCurrentDateTime(inputDate?: Date | string | number): {
  formattedDate: string;
  formattedTime: string;
  fullDisplay: string;
  fileSafeTimestamp: string;
} {
  const d = inputDate ? new Date(inputDate) : new Date();
  const validDate = isNaN(d.getTime()) ? new Date() : d;

  const formattedDate = validDate.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const formattedTime = validDate.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const fileSafeTimestamp = validDate
    .toISOString()
    .slice(0, 19)
    .replace(/:/g, "-")
    .replace("T", "_");

  return {
    formattedDate,
    formattedTime,
    fullDisplay: `${formattedDate}, ${formattedTime}`,
    fileSafeTimestamp,
  };
}

/**
 * Bulletproof cross-platform file download helper.
 * Works seamlessly in Chrome, Safari, Android WebView, PWA, and desktop browsers.
 */
export function saveOrDownloadBlob(blob: Blob, filename: string): boolean {
  try {
    // 1. Standard Object URL anchor click
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.style.display = "none";
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);

    // Dispatch synthetic mouse event for maximum compatibility across mobile webviews
    try {
      const clickEvent = new MouseEvent("click", {
        view: window,
        bubbles: true,
        cancelable: true,
      });
      link.dispatchEvent(clickEvent);
    } catch (_) {
      link.click();
    }

    setTimeout(() => {
      try {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
        window.URL.revokeObjectURL(url);
      } catch (_) {}
    }, 10000);
    return true;
  } catch (err) {
    console.warn("Standard ObjectURL download trigger failed, trying DataURL fallback:", err);
    try {
      // 2. Fallback: Base64 Data URL for webviews that restrict blob navigation
      const reader = new FileReader();
      reader.onloadend = () => {
        try {
          const dataUrl = reader.result as string;
          const link = document.createElement("a");
          link.style.display = "none";
          link.href = dataUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          setTimeout(() => {
            try {
              if (document.body.contains(link)) {
                document.body.removeChild(link);
              }
            } catch (_) {}
          }, 10000);
        } catch (_) {}
      };
      reader.readAsDataURL(blob);
      return true;
    } catch (e2) {
      console.error("DataURL download also failed:", e2);
      return false;
    }
  }
}

/**
 * Builds the Microsoft Excel workbook object (.xlsx)
 */
export function buildExcelWorkbook(data: ExportDataOptions): { wb: XLSX.WorkBook; filename: string } {
  const {
    title,
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
  } = data;
  const { fullDisplay, fileSafeTimestamp } = formatCurrentDateTime(calculationDate);
  const isMulti = Array.isArray(columns) && columns.length > 1;

  const wb = XLSX.utils.book_new();

  // If measurement chart (e.g. Everwin Tanners), create a dedicated side-by-side Matrix Sheet
  if (isMulti && columns && (isMeasurementChart || measurementMetadata?.isMeasurementChart || columns.length >= 4)) {
    const matrixData: any[][] = [];
    const company = measurementMetadata?.companyName || (title.includes("EVERWIN") ? "EVERWIN TANNERS - MELVISHARAM" : title);
    matrixData.push([company]);
    matrixData.push([`MEASUREMENT LIST - ${measurementMetadata?.date || fullDisplay}`]);
    if (measurementMetadata?.article) {
      matrixData.push([`Article: ${measurementMetadata.article}`]);
    }
    matrixData.push([
      `Total Pieces / Hides: ${measurementMetadata?.totalPieces || items.length}`,
      `Total Sq' Ft: ${measurementMetadata?.totalSqFt || grandTotal || sum}`,
      `Average Sq' Ft: ${measurementMetadata?.averageSqFt || (items.length ? ((grandTotal || sum) / items.length).toFixed(2) : "")}`,
    ]);
    matrixData.push([]);

    // Table Header: Row # followed by Column Titles
    const headerRow = ["Row #", ...columns.map((c) => c.title)];
    matrixData.push(headerRow);

    // Find max rows in any column (usually up to 30)
    const maxRows = Math.max(...columns.map((c) => c.items.length), 30);
    for (let r = 0; r < maxRows; r++) {
      const rowVals: any[] = [r + 1];
      let hasAnyVal = false;
      columns.forEach((col) => {
        if (r < col.items.length) {
          rowVals.push(col.items[r].value);
          hasAnyVal = true;
        } else {
          rowVals.push("");
        }
      });
      if (hasAnyVal) {
        matrixData.push(rowVals);
      }
    }

    // Column Totals Row
    matrixData.push([]);
    matrixData.push(["COLUMN TOTAL", ...columns.map((c) => c.sum)]);
    matrixData.push(["PIECES COUNT", ...columns.map((c) => c.items.length)]);
    matrixData.push([]);
    matrixData.push(["GRAND TOTAL SQ' FT", grandTotal ?? sum]);
    matrixData.push(["TOTAL HIDES / PIECES", items.length]);

    const matrixWs = XLSX.utils.aoa_to_sheet(matrixData);
    matrixWs["!cols"] = [{ wch: 8 }, ...columns.map(() => ({ wch: 15 }))];
    XLSX.utils.book_append_sheet(wb, matrixWs, "Measurement Matrix");
  }

  if (isMulti && columns) {
    // Create a Combined Multi-Line Summary Sheet
    const sheetData: any[][] = [];

    sheetData.push(["MEASUREMENT CHART - INDUSTRIAL & VERTICAL CALCULATION REPORT"]);
    sheetData.push(["Generated Date & Time:", fullDisplay]);
    sheetData.push(["Report Title:", title]);
    if (measurementMetadata?.companyName) {
      sheetData.push(["Company Name:", measurementMetadata.companyName]);
    }
    if (measurementMetadata?.totalPieces) {
      sheetData.push(["Total Pieces / Hides:", measurementMetadata.totalPieces]);
      sheetData.push(["Total Sq' Ft:", measurementMetadata.totalSqFt ?? grandTotal ?? sum]);
      sheetData.push(["Average Sq' Ft:", measurementMetadata.averageSqFt ?? ""]);
    }
    sheetData.push(["Calculation Mode:", `Multiple Vertical Lines (${columns.length} columns)`]);
    sheetData.push([]);

    // Section for each column
    columns.forEach((col, cIdx) => {
      sheetData.push([`COLUMN ${cIdx + 1}: ${col.title.toUpperCase()}`]);
      sheetData.push(["#", "Label", "Value", "Raw OCR Value"]);

      col.items.forEach((item, index) => {
        sheetData.push([
          index + 1,
          item.label || `Item ${index + 1}`,
          item.value,
          item.rawText || item.value.toString(),
        ]);
      });

      sheetData.push(["", "Column Sum:", col.sum, ""]);
      if (typeof col.existingWrittenSum === "number") {
        sheetData.push(["", "Written Note Total:", col.existingWrittenSum, ""]);
      }
      sheetData.push([]);
    });

    // Grand Total Section
    sheetData.push(["========================================"]);
    sheetData.push(["COMBINED GRAND TOTAL:", grandTotal ?? sum]);
    if (grandFormula) {
      sheetData.push(["Formula:", grandFormula]);
    }
    if (notes) {
      sheetData.push([]);
      sheetData.push(["OCR Notes:", notes]);
    }

    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    ws["!cols"] = [{ wch: 6 }, { wch: 25 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, "Calculation Summary");

    // Also create separate tabs for each column for easy analysis
    columns.forEach((col, idx) => {
      const colRows: any[][] = [
        [col.title],
        ["Date:", fullDisplay],
        [],
        ["Item Number", "Item Label", "Numeric Value", "Raw Scanned Text"],
      ];

      col.items.forEach((item, i) => {
        colRows.push([i + 1, item.label || `Line ${i + 1}`, item.value, item.rawText || item.value.toString()]);
      });

      colRows.push([]);
      colRows.push(["TOTAL SUM", "", col.sum, ""]);

      const colWs = XLSX.utils.aoa_to_sheet(colRows);
      colWs["!cols"] = [{ wch: 14 }, { wch: 24 }, { wch: 16 }, { wch: 18 }];
      const sheetName = (col.title || `Column ${idx + 1}`).substring(0, 30);
      XLSX.utils.book_append_sheet(wb, colWs, sheetName);
    });
  } else {
    // Single Column Calculation Sheet
    const sheetData: any[][] = [
      ["MEASUREMENT CHART - CALCULATION REPORT"],
      ["Date & Time:", fullDisplay],
      ["Title:", title],
      ["Mode:", "Single Vertical Column"],
      [],
      ["Line #", "Item Label", "Value", "Raw OCR Text"],
    ];

    items.forEach((item, index) => {
      sheetData.push([
        index + 1,
        item.label || `Item ${index + 1}`,
        item.value,
        item.rawText || item.value.toString(),
      ]);
    });

    sheetData.push([]);
    sheetData.push(["", "TOTAL SUM:", sum, ""]);
    if (typeof existingWrittenSum === "number") {
      sheetData.push(["", "Written Note Total:", existingWrittenSum, ""]);
    }
    if (notes) {
      sheetData.push([]);
      sheetData.push(["Notes:", notes, "", ""]);
    }

    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    ws["!cols"] = [{ wch: 8 }, { wch: 25 }, { wch: 16 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, "Calculation Result");
  }

  const filename = `Measurement_Chart_${fileSafeTimestamp}.xlsx`;
  return { wb, filename };
}

/**
 * Returns Excel File and Blob for downloading or native sharing
 */
export function getExcelFile(data: ExportDataOptions): { blob: Blob; file: File; filename: string } {
  const { wb, filename } = buildExcelWorkbook(data);
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const file = new File([blob], filename, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  return { blob, file, filename };
}

/**
 * Export calculation to Microsoft Excel (.xlsx) with resilient download handling
 */
export function exportToExcel(data: ExportDataOptions): boolean {
  try {
    const { blob, filename } = getExcelFile(data);
    return saveOrDownloadBlob(blob, filename);
  } catch (error) {
    console.error("Excel export error:", error);
    return false;
  }
}

/**
 * Shares the Excel (.xlsx) file using Web Share API Level 2, system text share, or direct download
 */
export async function shareExcelFile(data: ExportDataOptions): Promise<ShareFileResult> {
  try {
    const { file, filename, blob } = getExcelFile(data);
    const summaryText = `📊 ${data.title || "Measurement Chart"}\nTotal Hides/Items: ${data.items?.length || 0}\nGrand Total: ${data.grandTotal ?? data.sum}\nGenerated with Measurement Chart`;

    // Attempt Web Share API Level 2 with File
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      let sharedSuccessfully = false;

      // 1. Try sharing original .xlsx file
      try {
        if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `Measurement Chart - ${filename}`,
            text: summaryText,
            files: [file],
          });
          sharedSuccessfully = true;
          return {
            success: true,
            type: "native_share",
            message: `${filename} shared successfully!`,
          };
        }
      } catch (err: any) {
        if (err.name === "AbortError") {
          return { success: false, type: "aborted", message: "Share dialog cancelled." };
        }
        console.warn("Native Excel share with xlsx mime rejected:", err);
      }

      // 2. Try sharing with octet-stream MIME type (Android Chrome often allows this when xlsx is blocked)
      if (!sharedSuccessfully) {
        try {
          const streamFile = new File([blob], filename, { type: "application/octet-stream" });
          if (typeof navigator.canShare === "function" && navigator.canShare({ files: [streamFile] })) {
            await navigator.share({
              title: `Measurement Chart - ${filename}`,
              text: summaryText,
              files: [streamFile],
            });
            sharedSuccessfully = true;
            return {
              success: true,
              type: "native_share",
              message: `${filename} shared successfully!`,
            };
          }
        } catch (err: any) {
          if (err.name === "AbortError") {
            return { success: false, type: "aborted", message: "Share dialog cancelled." };
          }
          console.warn("Octet-stream share rejected:", err);
        }
      }

      // 3. If file sharing is not supported by device, share calculation summary text via system sheet
      if (!sharedSuccessfully) {
        try {
          await navigator.share({
            title: `Measurement Chart - ${data.title || filename}`,
            text: `${summaryText}\n\n(Excel spreadsheet saved to your device Downloads)`,
          });
          // Also save the file so user has it locally
          saveOrDownloadBlob(blob, filename);
          return {
            success: true,
            type: "native_share",
            message: `Summary shared & ${filename} saved to device!`,
          };
        } catch (err: any) {
          if (err.name === "AbortError") {
            return { success: false, type: "aborted", message: "Share dialog cancelled." };
          }
          console.warn("Text share rejected, falling back to download:", err);
        }
      }
    }

    // Direct download fallback for desktop or non-share environments
    saveOrDownloadBlob(blob, filename);
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(summaryText);
      } catch (_) {}
    }

    return {
      success: true,
      type: "downloaded_fallback",
      message: `${filename} downloaded to your device! Summary copied to clipboard.`,
    };
  } catch (err) {
    console.error("Share Excel file error:", err);
    return {
      success: false,
      type: "error",
      message: "Could not share or download Excel file.",
    };
  }
}

/**
 * Generates the jsPDF Document (.pdf) with professional formatting
 */
export function buildPdfDocument(data: ExportDataOptions): { doc: jsPDF; filename: string } {
  const {
    title,
    items,
    sum,
    columns,
    grandTotal,
    grandFormula,
    existingWrittenSum,
    notes,
    imageSrc,
    calculationDate,
    measurementMetadata,
    isMeasurementChart,
  } = data;

  const { fullDisplay, fileSafeTimestamp } = formatCurrentDateTime(calculationDate);
  const isMulti = Array.isArray(columns) && columns.length > 1;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  let y = margin;

  // Header Background Accent (Refined Industrial Emerald / Navy)
  doc.setFillColor(15, 23, 42); // Slate 900
  doc.rect(0, 0, pageWidth, 26, "F");

  // Emerald Top Indicator Stripe
  doc.setFillColor(16, 185, 129); // Emerald 500
  doc.rect(0, 0, pageWidth, 2.5, "F");

  // Header Title
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("MEASUREMENT CHART", margin, 12);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(203, 213, 225);
  doc.text("Industrial Measurement, Tannery Matrix & Vertical Calculation Report", margin, 17.5);
  doc.text(`Generated: ${fullDisplay}`, margin, 22.5);

  y = 33;

  // Metadata Card
  const hasMeasurement = isMeasurementChart || measurementMetadata?.isMeasurementChart || (columns && columns.length >= 4);
  const cardHeight = hasMeasurement ? 28 : 22;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, pageWidth - margin * 2, cardHeight, 2.5, 2.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(30, 41, 59);
  doc.text(measurementMetadata?.companyName || title, margin + 4, y + 6.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Date & Time: ${measurementMetadata?.date ? `${measurementMetadata.date} • ${fullDisplay}` : fullDisplay}`, margin + 4, y + 12);

  if (hasMeasurement) {
    doc.text(
      `Mode: Measurement Chart (${columns?.length || 0} Columns) • Total Hides/Pieces: ${measurementMetadata?.totalPieces || items.length}`,
      margin + 4,
      y + 17
    );
    doc.setFont("helvetica", "bold");
    doc.setTextColor(16, 185, 129);
    doc.text(
      `Total Sq' Ft: ${measurementMetadata?.totalSqFt || grandTotal || sum}  •  Average: ${measurementMetadata?.averageSqFt || (items.length ? ((grandTotal || sum) / items.length).toFixed(2) : "")} Sq' Ft/Hide`,
      margin + 4,
      y + 22.5
    );
  } else {
    doc.text(
      isMulti && columns
        ? `Mode: ${columns.length} Vertical Lines • Total Numbers: ${items.length}`
        : `Mode: Single Vertical Column • Total Numbers: ${items.length}`,
      margin + 4,
      y + 17
    );
  }

  // Optional Embedded Thumbnail on the right
  if (imageSrc && imageSrc.startsWith("data:image")) {
    try {
      const thumbWidth = 24;
      const thumbHeight = 18;
      const thumbX = pageWidth - margin - thumbWidth - 4;
      const thumbY = y + 2.5;
      doc.addImage(imageSrc, "JPEG", thumbX, thumbY, thumbWidth, thumbHeight, undefined, "FAST");
      doc.setDrawColor(203, 213, 225);
      doc.rect(thumbX, thumbY, thumbWidth, thumbHeight);
    } catch (e) {
      // Continue if thumbnail cannot be embedded
    }
  }

  y += cardHeight + 6;

  // If this is an 8-column Tannery / Measurement Chart, render the compact 8-column matrix table
  if (hasMeasurement && isMulti && columns && columns.length >= 4) {
    const tableWidth = pageWidth - margin * 2;
    const colCount = columns.length;
    const colWidth = (tableWidth - 14) / colCount; // first column for Row #
    const rowNumWidth = 14;

    // Header background
    doc.setFillColor(30, 41, 59);
    doc.rect(margin, y, tableWidth, 7, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text("Row", margin + 3, y + 4.8);

    columns.forEach((col, idx) => {
      const colX = margin + rowNumWidth + idx * colWidth;
      doc.text(`C${idx + 1}`, colX + colWidth / 2, y + 4.8, { align: "center" });
    });
    y += 7;

    const actualMaxItems = Math.max(...columns.map((c) => c.items?.length || 0), 1);
    const maxRows = hasMeasurement ? Math.max(actualMaxItems, 30) : actualMaxItems;
    const rowHeight = 5.2;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);

    for (let r = 0; r < maxRows; r++) {
      if (y > pageHeight - 25) {
        doc.addPage();
        y = margin;

        // Re-print table header on new page
        doc.setFillColor(30, 41, 59);
        doc.rect(margin, y, tableWidth, 7, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        doc.text("Row", margin + 3, y + 4.8);
        columns.forEach((col, idx) => {
          const colX = margin + rowNumWidth + idx * colWidth;
          doc.text(`C${idx + 1}`, colX + colWidth / 2, y + 4.8, { align: "center" });
        });
        y += 7;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
      }

      if (r % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, tableWidth, rowHeight, "F");
      }

      doc.setTextColor(100, 116, 139);
      doc.text(`${r + 1}`, margin + 3, y + 3.8);

      columns.forEach((col, idx) => {
        const item = col.items?.[r];
        if (item && item.value !== undefined && item.value !== null) {
          const colX = margin + rowNumWidth + idx * colWidth;
          doc.setTextColor(15, 23, 42);
          doc.setFont("courier", "normal");
          doc.text(formatDisplayNumber(item.value), colX + colWidth - 2, y + 3.8, { align: "right" });
          doc.setFont("helvetica", "normal");
        }
      });

      y += rowHeight;
    }

    // Totals row at the bottom of matrix
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, tableWidth, 6.5, "F");
    doc.setDrawColor(30, 41, 59);
    doc.setLineWidth(0.3);
    doc.line(margin, y, margin + tableWidth, y);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text("SUM", margin + 2.5, y + 4.5);

    columns.forEach((col, idx) => {
      const colX = margin + rowNumWidth + idx * colWidth;
      doc.setFont("courier", "bold");
      doc.text(formatDisplayNumber(col.sum), colX + colWidth - 2, y + 4.5, { align: "right" });
    });

    y += 9;

    // Grand Total Box
    if (y > pageHeight - 35) {
      doc.addPage();
      y = margin;
    }

    doc.setFillColor(15, 23, 42);
    doc.roundedRect(margin, y, tableWidth, 20, 2.5, 2.5, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(203, 213, 225);
    doc.text("GRAND TOTAL (MEASUREMENT SUM)", margin + 6, y + 6.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Total Count: ${measurementMetadata?.totalPieces || items.length} • Average: ${measurementMetadata?.averageSqFt || (items.length ? (Number(grandTotal ?? sum) / items.length).toFixed(2) : "")}`, margin + 6, y + 13);

    doc.setFont("courier", "bold");
    doc.setFontSize(16);
    doc.setTextColor(16, 185, 129);
    doc.text(formatDisplayNumber(grandTotal ?? sum), pageWidth - margin - 6, y + 13, { align: "right" });

    y += 26;
  } else if (isMulti && columns) {
    // Multi-column standard layout
    columns.forEach((col, colIdx) => {
      if (y > pageHeight - 50) {
        doc.addPage();
        y = margin;
      }

      doc.setFillColor(241, 245, 249);
      doc.roundedRect(margin, y, pageWidth - margin * 2, 7.5, 1.5, 1.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(37, 99, 235);
      doc.text(`VERTICAL LINE ${colIdx + 1}: ${col.title.toUpperCase()}`, margin + 4, y + 5.2);
      y += 10;

      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, pageWidth - margin * 2, 6.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text("LINE", margin + 4, y + 4.2);
      doc.text("ITEM LABEL", margin + 25, y + 4.2);
      doc.text("RAW OCR", margin + 95, y + 4.2);
      doc.text("VALUE", pageWidth - margin - 6, y + 4.2, { align: "right" });
      y += 6.5;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      col.items.forEach((item, idx) => {
        if (y > pageHeight - 20) {
          doc.addPage();
          y = margin;
        }

        if (idx % 2 === 1) {
          doc.setFillColor(250, 250, 250);
          doc.rect(margin, y, pageWidth - margin * 2, 6, "F");
        }

        doc.setTextColor(148, 163, 184);
        doc.text(`${idx + 1}`, margin + 4, y + 4.2);
        doc.setTextColor(51, 65, 85);
        doc.text(item.label || `Item ${idx + 1}`, margin + 25, y + 4.2);
        doc.setTextColor(100, 116, 139);
        doc.text(item.rawText || item.value.toString(), margin + 95, y + 4.2);

        doc.setFont("courier", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text(item.value.toString(), pageWidth - margin - 6, y + 4.2, { align: "right" });
        doc.setFont("helvetica", "normal");

        y += 6;
      });

      doc.setDrawColor(30, 41, 59);
      doc.setLineWidth(0.4);
      doc.line(pageWidth - margin - 45, y, pageWidth - margin - 4, y);
      y += 3.5;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(30, 41, 59);
      doc.text(`${col.title} Result:`, pageWidth - margin - 48, y + 2, { align: "right" });

      doc.setFont("courier", "bold");
      doc.setFontSize(11);
      doc.setTextColor(37, 99, 235);
      doc.text(formatDisplayNumber(col.sum), pageWidth - margin - 6, y + 2, { align: "right" });
      y += 9;
    });

    if (y > pageHeight - 40) {
      doc.addPage();
      y = margin;
    }

    doc.setFillColor(30, 41, 59);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 20, 2.5, 2.5, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(224, 231, 255);
    doc.text("COMBINED GRAND TOTAL (FINAL RESULT)", margin + 6, y + 6.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(grandFormula || `Sum of all ${columns.length} vertical lines`, margin + 6, y + 13);

    doc.setFont("courier", "bold");
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text(formatDisplayNumber(grandTotal ?? sum), pageWidth - margin - 8, y + 13, { align: "right" });

    y += 26;
  } else {
    // Single column standard layout
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, y, pageWidth - margin * 2, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text("LINE", margin + 4, y + 4.5);
    doc.text("ITEM LABEL", margin + 25, y + 4.5);
    doc.text("RAW OCR VALUE", margin + 95, y + 4.5);
    doc.text("VALUE", pageWidth - margin - 6, y + 4.5, { align: "right" });
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    items.forEach((item, idx) => {
      if (y > pageHeight - 20) {
        doc.addPage();
        y = margin;
      }

      if (idx % 2 === 1) {
        doc.setFillColor(250, 250, 250);
        doc.rect(margin, y, pageWidth - margin * 2, 6.5, "F");
      }

      doc.setTextColor(148, 163, 184);
      doc.text(`${idx + 1}`, margin + 4, y + 4.5);
      doc.setTextColor(51, 65, 85);
      doc.text(item.label || `Item ${idx + 1}`, margin + 25, y + 4.5);
      doc.setTextColor(100, 116, 139);
      doc.text(item.rawText || item.value.toString(), margin + 95, y + 4.5);

      doc.setFont("courier", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(item.value.toString(), pageWidth - margin - 6, y + 4.5, { align: "right" });
      doc.setFont("helvetica", "normal");

      y += 6.5;
    });

    y += 2;
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.6);
    doc.line(pageWidth - margin - 50, y, pageWidth - margin - 4, y);
    y += 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("TOTAL SUM:", pageWidth - margin - 52, y + 2, { align: "right" });

    doc.setFont("courier", "bold");
    doc.setFontSize(16);
    doc.setTextColor(37, 99, 235);
    doc.text(formatDisplayNumber(sum), pageWidth - margin - 6, y + 2, { align: "right" });

    if (typeof existingWrittenSum === "number") {
      y += 7;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`(Written total detected on note: ${existingWrittenSum})`, pageWidth - margin - 6, y, {
        align: "right",
      });
    }

    y += 14;
  }

  // Calculation Notes & Remarks section if present
  if (notes && notes.trim()) {
    const cleanNotes = notes.trim();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const textMaxWidth = pageWidth - margin * 2 - 8;
    const noteLines: string[] = doc.splitTextToSize(cleanNotes, textMaxWidth);
    const boxHeight = Math.max(16, 10 + noteLines.length * 4.2);

    if (y + boxHeight > pageHeight - 20) {
      doc.addPage();
      y = margin;
    }

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, pageWidth - margin * 2, boxHeight, 2, 2, "FD");

    // Indicator accent on left
    doc.setFillColor(16, 185, 129);
    doc.rect(margin, y, 2, boxHeight, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text("CALCULATION NOTES & REMARKS", margin + 5, y + 5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text(noteLines, margin + 5, y + 10);
    y += boxHeight + 8;
  }

  // Document Footer on each page
  const pageCount = doc.internal.pages.length - 1;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Measurement Chart Report • Date: ${fullDisplay}`,
      margin,
      pageHeight - 8
    );
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 8, {
      align: "right",
    });
  }

  const filename = `Measurement_Chart_${fileSafeTimestamp}.pdf`;
  return { doc, filename };
}

/**
 * Returns PDF File and Blob for downloading or native sharing
 */
export function getPdfFile(data: ExportDataOptions): { blob: Blob; file: File; filename: string; doc: jsPDF } {
  const { doc, filename } = buildPdfDocument(data);
  const blob = doc.output("blob");
  const file = new File([blob], filename, { type: "application/pdf" });
  return { blob, file, filename, doc };
}

/**
 * Export calculation to PDF document (.pdf) with resilient download handling
 */
export function exportToPdf(data: ExportDataOptions): boolean {
  try {
    const { blob, filename } = getPdfFile(data);
    return saveOrDownloadBlob(blob, filename);
  } catch (error) {
    console.error("PDF export error:", error);
    return false;
  }
}

/**
 * Shares the PDF (.pdf) file using Web Share API Level 2, system text share, or direct download
 */
export async function sharePdfFile(data: ExportDataOptions): Promise<ShareFileResult> {
  try {
    const { file, filename, blob } = getPdfFile(data);
    const summaryText = `📄 ${data.title || "Measurement Chart Report"}\nTotal Hides/Items: ${data.items?.length || 0}\nGrand Total: ${data.grandTotal ?? data.sum}\nGenerated with Measurement Chart`;

    // Attempt Web Share API Level 2 with File
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      let sharedSuccessfully = false;

      // 1. Try native share with PDF file
      try {
        if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `Measurement Chart - ${filename}`,
            text: summaryText,
            files: [file],
          });
          sharedSuccessfully = true;
          return {
            success: true,
            type: "native_share",
            message: `${filename} shared successfully!`,
          };
        }
      } catch (err: any) {
        if (err.name === "AbortError") {
          return { success: false, type: "aborted", message: "Share dialog cancelled." };
        }
        console.warn("Native PDF file share rejected:", err);
      }

      // 2. Fallback to system text share if file sharing is restricted by browser
      if (!sharedSuccessfully) {
        try {
          await navigator.share({
            title: `Measurement Chart - ${data.title || filename}`,
            text: `${summaryText}\n\n(PDF Report saved to your device Downloads)`,
          });
          // Also save the file locally
          saveOrDownloadBlob(blob, filename);
          return {
            success: true,
            type: "native_share",
            message: `Summary shared & ${filename} saved to device!`,
          };
        } catch (err: any) {
          if (err.name === "AbortError") {
            return { success: false, type: "aborted", message: "Share dialog cancelled." };
          }
          console.warn("Text share rejected, falling back to download:", err);
        }
      }
    }

    // Direct download fallback for desktop or non-share environments
    saveOrDownloadBlob(blob, filename);
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(summaryText);
      } catch (_) {}
    }

    return {
      success: true,
      type: "downloaded_fallback",
      message: `${filename} downloaded to your device! Summary copied to clipboard.`,
    };
  } catch (err) {
    console.error("Share PDF file error:", err);
    return {
      success: false,
      type: "error",
      message: "Could not share or download PDF file.",
    };
  }
}

/**
 * Opens PDF in a new tab for previewing / printing
 */
export function previewPdf(data: ExportDataOptions): boolean {
  try {
    const { blob } = getPdfFile(data);
    const blobUrl = URL.createObjectURL(blob);
    const win = window.open(blobUrl, "_blank");
    if (!win) {
      // Popup blocker caught it, trigger direct download instead
      return exportToPdf(data);
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    return true;
  } catch (err) {
    console.error("PDF preview error:", err);
    return false;
  }
}
