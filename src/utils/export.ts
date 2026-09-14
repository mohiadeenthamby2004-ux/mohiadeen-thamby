import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import { DetectedNumberItem, VerticalColumnLine, MeasurementMetadata } from "../types";

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
 * Export calculation to Microsoft Excel (.xlsx)
 */
export function exportToExcel(data: ExportDataOptions): boolean {
  try {
    const { title, items, sum, columns, grandTotal, grandFormula, existingWrittenSum, notes, calculationDate, measurementMetadata, isMeasurementChart } = data;
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

      sheetData.push(["PHOTO ADDITION CALCULATOR - CALCULATION REPORT"]);
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

      // Set column widths
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
        ["PHOTO ADDITION CALCULATOR - CALCULATION REPORT"],
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

    const filename = `Calculation_${fileSafeTimestamp}.xlsx`;
    XLSX.writeFile(wb, filename);
    return true;
  } catch (error) {
    console.error("Excel export error:", error);
    return false;
  }
}

/**
 * Export calculation to PDF document (.pdf)
 */
export function exportToPdf(data: ExportDataOptions): boolean {
  try {
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
    const margin = 16;
    let y = margin;

    // Header Background Accent
    doc.setFillColor(37, 99, 235); // Blue 600
    doc.rect(0, 0, pageWidth, 28, "F");

    // Header Title
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("PHOTO ADDITION CALCULATOR", margin, 12);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(224, 231, 255);
    doc.text("Vertical Arithmetic & OCR Extraction Report", margin, 18);
    doc.text(`Generated: ${fullDisplay}`, margin, 24);

    y = 38;

    // Metadata Card
    const hasMeasurement = isMeasurementChart || measurementMetadata?.isMeasurementChart || (columns && columns.length >= 4);
    const cardHeight = hasMeasurement ? 30 : 22;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, pageWidth - margin * 2, cardHeight, 3, 3, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.text(measurementMetadata?.companyName || title, margin + 4, y + 7);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Date & Time: ${measurementMetadata?.date ? `${measurementMetadata.date} • ${fullDisplay}` : fullDisplay}`, margin + 4, y + 13);
    
    if (hasMeasurement) {
      doc.text(
        `Mode: Measurement Chart (${columns?.length || 0} Columns) • Total Hides/Pieces: ${measurementMetadata?.totalPieces || items.length}`,
        margin + 4,
        y + 18
      );
      doc.setFont("helvetica", "bold");
      doc.setTextColor(37, 99, 235);
      doc.text(
        `Total Sq' Ft: ${measurementMetadata?.totalSqFt || grandTotal || sum}  •  Average: ${measurementMetadata?.averageSqFt || (items.length ? ((grandTotal || sum) / items.length).toFixed(2) : "")} Sq' Ft/Hide`,
        margin + 4,
        y + 24
      );
    } else {
      doc.text(
        isMulti && columns
          ? `Mode: ${columns.length} Vertical Lines • Total Numbers: ${items.length}`
          : `Mode: Single Vertical Column • Total Numbers: ${items.length}`,
        margin + 4,
        y + 18
      );
    }

    // Optional Embedded Thumbnail on the right
    if (imageSrc && imageSrc.startsWith("data:image")) {
      try {
        const thumbWidth = 24;
        const thumbHeight = 18;
        const thumbX = pageWidth - margin - thumbWidth - 4;
        const thumbY = y + 2;
        doc.addImage(imageSrc, "JPEG", thumbX, thumbY, thumbWidth, thumbHeight, undefined, "FAST");
        doc.setDrawColor(203, 213, 225);
        doc.rect(thumbX, thumbY, thumbWidth, thumbHeight);
      } catch (e) {
        // Continue if thumbnail cannot be embedded
      }
    }

    y += cardHeight + 6;

    // Render Table Content
    if (isMulti && columns) {
      // Multiple Columns Layout
      columns.forEach((col, colIdx) => {
        // Page break if needed
        if (y > pageHeight - 50) {
          doc.addPage();
          y = margin;
        }

        // Column Section Header
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(margin, y, pageWidth - margin * 2, 8, 1.5, 1.5, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(37, 99, 235);
        doc.text(`VERTICAL LINE ${colIdx + 1}: ${col.title.toUpperCase()}`, margin + 4, y + 5.5);
        y += 11;

        // Table Header
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, pageWidth - margin * 2, 7, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        doc.text("LINE", margin + 4, y + 4.5);
        doc.text("ITEM LABEL", margin + 25, y + 4.5);
        doc.text("RAW OCR", margin + 95, y + 4.5);
        doc.text("VALUE", pageWidth - margin - 6, y + 4.5, { align: "right" });
        y += 7;

        // Table Rows
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        col.items.forEach((item, idx) => {
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

        // Column Divider & Sum
        doc.setDrawColor(30, 41, 59);
        doc.setLineWidth(0.5);
        doc.line(pageWidth - margin - 45, y, pageWidth - margin - 4, y);
        y += 4;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(30, 41, 59);
        doc.text(`${col.title} Result:`, pageWidth - margin - 48, y + 2, { align: "right" });

        doc.setFont("courier", "bold");
        doc.setFontSize(12);
        doc.setTextColor(37, 99, 235);
        doc.text(`${col.sum}`, pageWidth - margin - 6, y + 2, { align: "right" });
        y += 10;
      });

      // Page break check for Grand Total Box
      if (y > pageHeight - 45) {
        doc.addPage();
        y = margin;
      }

      // Grand Total Box
      doc.setFillColor(30, 41, 59); // Slate 800
      doc.roundedRect(margin, y, pageWidth - margin * 2, 22, 3, 3, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(224, 231, 255);
      doc.text("COMBINED GRAND TOTAL (FINAL RESULT)", margin + 6, y + 7);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(grandFormula || `Sum of all ${columns.length} vertical lines`, margin + 6, y + 14);

      doc.setFont("courier", "bold");
      doc.setFontSize(18);
      doc.setTextColor(255, 255, 255);
      doc.text(`${grandTotal ?? sum}`, pageWidth - margin - 8, y + 14, { align: "right" });

      y += 28;
    } else {
      // Single Column Table Layout
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

      // Summation Line
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
      doc.text(`${sum}`, pageWidth - margin - 6, y + 2, { align: "right" });

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

      // Small blue accent indicator on the left
      doc.setFillColor(37, 99, 235);
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

    // Document Footer with page numbers and timestamp
    const pageCount = doc.internal.pages.length - 1;
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Photo Addition Calculator Report • Date: ${fullDisplay}`,
        margin,
        pageHeight - 8
      );
      doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 8, {
        align: "right",
      });
    }

    const filename = `Calculation_${fileSafeTimestamp}.pdf`;
    doc.save(filename);
    return true;
  } catch (error) {
    console.error("PDF export error:", error);
    return false;
  }
}
