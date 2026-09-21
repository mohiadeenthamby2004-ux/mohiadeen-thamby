import { CalculationResult, DetectedNumberItem, VerticalColumnLine } from "../types";

/**
 * Rule / Specification:
 * "When performing addition, any 3-digit number should have a decimal point placed
 * after the first two digits (e.g., assume 333 as 33.3)."
 *
 * Examples:
 * - 333 -> 33.3
 * - 322 -> 32.2
 * - 180 -> 18.0
 * - 245 -> 24.5
 * - 100 -> 10.0
 * - 33.3 -> 33.3 (already decimal, unchanged)
 * - 25 -> 25 (2 digits, unchanged)
 * - 4475 -> 4475 (4 digits, unchanged)
 */
export function normalize3DigitValue(val: number | string | null | undefined): number {
  if (val == null) return 0;

  if (typeof val === "string") {
    const trimmed = val.trim().replace(/,/g, "").replace(/-$/, "");
    // Check if exactly 3 digits (optional leading +/- sign) without decimal point
    if (/^[+-]?\d{3}$/.test(trimmed)) {
      const parsedInt = parseInt(trimmed, 10);
      return Number((parsedInt / 10).toFixed(1));
    }
    const parsedFloat = parseFloat(trimmed);
    if (isNaN(parsedFloat)) return 0;
    val = parsedFloat;
  }

  if (typeof val === "number" && !isNaN(val)) {
    const absVal = Math.abs(val);
    // If it is an integer with exactly 3 digits (100 through 999)
    if (Number.isInteger(val) && absVal >= 100 && absVal <= 999) {
      return Number((val / 10).toFixed(1));
    }
    return val;
  }

  return 0;
}

/**
 * Formats a 3-digit input or number for display showing original and normalized value if changed
 */
export function formatNormalizedInputHint(rawText: string | number): string {
  const normalized = normalize3DigitValue(rawText);
  const rawNum = typeof rawText === "number" ? rawText : parseFloat(String(rawText).replace(/-$/, ""));
  if (!isNaN(rawNum) && Number.isInteger(rawNum) && Math.abs(rawNum) >= 100 && Math.abs(rawNum) <= 999) {
    return `${rawNum} → ${normalized}`;
  }
  return String(rawText);
}

export interface ColumnSummaryItem {
  id: string;
  title: string;
  count: number;
  sum: number;
  average: number;
  percentage: number;
  formula: string;
  items: DetectedNumberItem[];
}

export interface GrandSummaryResult {
  columns: ColumnSummaryItem[];
  grandTotal: number;
  totalCount: number;
  average: number;
  columnCount: number;
}

/**
 * Calculates a clean, high-level summary of multiple vertical columns
 */
export function calculateColumnSummaries(
  columns: VerticalColumnLine[],
  providedGrandTotal?: number
): GrandSummaryResult {
  const totalCount = columns.reduce((acc, col) => acc + (col.items?.length || 0), 0);
  const columnSums = columns.map((col) => col.sum);
  const calculatedGrandTotal = providedGrandTotal ?? computeSafeSum(columnSums).sum;
  const overallAvg = totalCount > 0 ? Number((calculatedGrandTotal / totalCount).toFixed(2)) : 0;

  const summaryItems: ColumnSummaryItem[] = columns.map((col) => {
    const count = col.items?.length || 0;
    const colSum = col.sum;
    const avg = count > 0 ? Number((colSum / count).toFixed(2)) : 0;
    const pct = calculatedGrandTotal > 0 ? Number(((colSum / calculatedGrandTotal) * 100).toFixed(1)) : 0;

    return {
      id: col.id,
      title: col.title,
      count,
      sum: colSum,
      average: avg,
      percentage: pct,
      formula: col.formula,
      items: col.items || [],
    };
  });

  return {
    columns: summaryItems,
    grandTotal: calculatedGrandTotal,
    totalCount,
    average: overallAvg,
    columnCount: columns.length,
  };
}

/**
 * Partitions an array of DetectedNumberItem into multiple VerticalColumnLines
 * Intelligently clusters by bounding box X coordinates if available, or distributes evenly across N columns.
 */
export function partitionIntoMultipleColumns(
  items: DetectedNumberItem[],
  targetColCount: number = 4
): VerticalColumnLine[] {
  if (!items || items.length === 0) return [];
  const safeCols = Math.max(2, Math.min(targetColCount, 12));

  // Check if box_2d is available with distinct X coordinates
  const itemsWithBoxes = items.filter(
    (it) => Array.isArray(it.box_2d) && it.box_2d.length === 4
  );

  let buckets: DetectedNumberItem[][] = Array.from({ length: safeCols }, () => []);

  if (itemsWithBoxes.length >= Math.min(items.length * 0.5, 4)) {
    const xCenters = items.map((it) => {
      if (Array.isArray(it.box_2d) && it.box_2d.length === 4) {
        return (it.box_2d[1] + it.box_2d[3]) / 2;
      }
      return 500;
    });

    const minX = Math.min(...xCenters);
    const maxX = Math.max(...xCenters);
    const range = Math.max(maxX - minX, 50);

    for (const it of items) {
      let x = 500;
      if (Array.isArray(it.box_2d) && it.box_2d.length === 4) {
        x = (it.box_2d[1] + it.box_2d[3]) / 2;
      }
      let bucketIdx = Math.floor(((x - minX) / range) * safeCols);
      if (bucketIdx >= safeCols) bucketIdx = safeCols - 1;
      if (bucketIdx < 0) bucketIdx = 0;
      buckets[bucketIdx].push(it);
    }

    // If clustering left too many empty buckets, fallback to even chunking
    const nonEmpty = buckets.filter((b) => b.length > 0);
    if (nonEmpty.length < 2) {
      buckets = chunkEvenly(items, safeCols);
    } else {
      buckets = nonEmpty;
    }
  } else {
    buckets = chunkEvenly(items, safeCols);
  }

  return buckets.map((colItems, cIdx) => {
    // Sort items top-to-bottom
    colItems.sort((a, b) => {
      const ya = Array.isArray(a.box_2d) && a.box_2d.length === 4 ? a.box_2d[0] : 0;
      const yb = Array.isArray(b.box_2d) && b.box_2d.length === 4 ? b.box_2d[0] : 0;
      return ya - yb;
    });

    const { sum, formula, maxDecimals } = computeSafeSum(colItems);

    return {
      id: `col-${cIdx + 1}-${Date.now()}`,
      title: `Column ${cIdx + 1}`,
      items: colItems.map((it, rIdx) => ({
        ...it,
        columnIndex: cIdx,
        label: `Row ${rIdx + 1}`,
      })),
      sum,
      formula,
      maxDecimals,
    };
  });
}

function chunkEvenly(items: DetectedNumberItem[], numCols: number): DetectedNumberItem[][] {
  const result: DetectedNumberItem[][] = Array.from({ length: numCols }, () => []);
  const itemsPerCol = Math.ceil(items.length / numCols);

  for (let i = 0; i < items.length; i++) {
    const colIdx = Math.min(Math.floor(i / itemsPerCol), numCols - 1);
    result[colIdx].push(items[i]);
  }

  return result.filter((col) => col.length > 0);
}


/**
 * Calculates sum safely without floating point inaccuracies (e.g. 33.3 + 32.2 = 65.5)
 * Accepts either an array of DetectedNumberItem objects, or raw number values, or numeric strings.
 * Applies rule: any 3-digit number has a decimal point placed after the first two digits (e.g. 333 -> 33.3).
 */
export function computeSafeSum(itemsOrNumbers: (DetectedNumberItem | number)[]): {
  sum: number;
  formula: string;
  maxDecimals: number;
} {
  const numericValues: number[] = [];
  if (Array.isArray(itemsOrNumbers)) {
    for (const it of itemsOrNumbers) {
      if (typeof it === "number") {
        if (!isNaN(it)) numericValues.push(normalize3DigitValue(it));
      } else if (it != null) {
        const directVal = (it as any).value;
        if (typeof directVal === "number" && !isNaN(directVal)) {
          numericValues.push(normalize3DigitValue(directVal));
        } else {
          const raw = String(directVal ?? (it as any).rawText ?? "");
          const parsed = parseFloat(raw.replace(/,/g, "").replace(/-$/, ""));
          if (!isNaN(parsed)) {
            numericValues.push(normalize3DigitValue(raw || parsed));
          }
        }
      }
    }
  }

  if (numericValues.length === 0) {
    return { sum: 0, formula: "0 = 0", maxDecimals: 0 };
  }

  let maxDecimals = 0;
  for (const val of numericValues) {
    const s = val.toString();
    const parts = s.split(".");
    if (parts.length > 1) {
      maxDecimals = Math.max(maxDecimals, parts[1].length);
    }
  }

  const factor = Math.pow(10, Math.min(maxDecimals, 8));
  const sumInInt = numericValues.reduce((acc, val) => acc + Math.round(val * factor), 0);
  const sum = Number((sumInInt / factor).toFixed(Math.min(maxDecimals, 8)));

  const formula = numericValues.join(" + ") + " = " + sum;

  return { sum, formula, maxDecimals };
}

/**
 * Cleanly formats a number for prominent UI display, avoiding NaN or floating-point glitches
 */
export function formatDisplayNumber(val: number | string | undefined | null, minDecimals?: number): string {
  if (val == null) return "0";
  const num = typeof val === "number" ? val : parseFloat(String(val).replace(/,/g, "").replace(/-$/, ""));
  if (isNaN(num)) return "0";
  if (typeof minDecimals === "number") {
    return num.toLocaleString(undefined, { minimumFractionDigits: minDecimals, maximumFractionDigits: minDecimals });
  }
  return num.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

/**
 * Generates an ASCII vertical column addition formatted string
 */
export function formatVerticalColumn(items: DetectedNumberItem[], sum: number): string {
  if (items.length === 0) return "0\n---\n0";

  const numStrings = items.map((it) => it.value.toString());
  const sumString = sum.toString();

  const maxLen = Math.max(
    ...numStrings.map((s) => s.length),
    sumString.length
  );

  const lines: string[] = [];
  numStrings.forEach((s, idx) => {
    const prefix = idx === numStrings.length - 1 ? "+ " : "  ";
    lines.push(prefix + s.padStart(maxLen, " "));
  });

  lines.push("-".repeat(maxLen + 2));
  lines.push("  " + sumString.padStart(maxLen, " "));

  return lines.join("\n");
}

/**
 * Creates a synthetic demo image with vertical handwritten or printed numbers on paper
 */
export function generateSampleCanvasImage(
  title = "Vertical Numbers",
  numbers: { val: number; label?: string }[] = [{ val: 33.3 }, { val: 32.2 }],
  style: "notebook" | "receipt" | "clean" = "notebook"
): string {
  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 700;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // Background
  if (style === "notebook") {
    ctx.fillStyle = "#faf7ee";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Notebook ruled lines
    ctx.strokeStyle = "#e2d9c2";
    ctx.lineWidth = 1;
    for (let y = 80; y < canvas.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(30, y);
      ctx.lineTo(canvas.width - 30, y);
      ctx.stroke();
    }

    // Left margin line
    ctx.strokeStyle = "#f3b5b5";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(110, 0);
    ctx.lineTo(110, canvas.height);
    ctx.stroke();
  } else if (style === "receipt") {
    ctx.fillStyle = "#fcfbf7";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "#e5e3da";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
    ctx.setLineDash([]);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Header Title
  ctx.fillStyle = "#2c3e50";
  ctx.font = "bold 24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(title, 130, 65);

  // Draw vertical numbers
  const startY = 140;
  const lineHeight = 55;

  ctx.font = "bold 32px 'Courier New', monospace";
  ctx.textAlign = "right";

  numbers.forEach((item, index) => {
    const y = startY + index * lineHeight;

    // Optional Label
    if (item.label) {
      ctx.save();
      ctx.textAlign = "left";
      ctx.font = "16px -apple-system, sans-serif";
      ctx.fillStyle = "#64748b";
      ctx.fillText(item.label, 130, y - 8);
      ctx.restore();
    }

    // Plus sign for second or subsequent items
    if (index === numbers.length - 1) {
      ctx.save();
      ctx.font = "bold 28px -apple-system, sans-serif";
      ctx.fillStyle = "#2563eb";
      ctx.fillText("+", 330, y);
      ctx.restore();
    }

    ctx.fillStyle = "#0f172a";
    ctx.fillText(item.val.toString(), 460, y);
  });

  // Draw summation line
  const dividerY = startY + numbers.length * lineHeight - 15;
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(330, dividerY);
  ctx.lineTo(470, dividerY);
  ctx.stroke();

  return canvas.toDataURL("image/jpeg", 0.92);
}

/**
 * Generates sample image with 2 or more vertical columns side-by-side
 */
export function generateMultiColumnCanvasImage(
  title = "Daily Sales Ledgers",
  columns: { title: string; numbers: { val: number; label?: string }[] }[] = [
    {
      title: "Line 1 (Morning)",
      numbers: [
        { val: 33.3, label: "Item A" },
        { val: 32.2, label: "Item B" },
      ],
    },
    {
      title: "Line 2 (Evening)",
      numbers: [
        { val: 15.5, label: "Item C" },
        { val: 24.5, label: "Item D" },
      ],
    },
  ]
): string {
  const canvas = document.createElement("canvas");
  canvas.width = 750;
  canvas.height = 600;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // Notebook paper background
  ctx.fillStyle = "#fcfbf7";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Notebook horizontal lines
  ctx.strokeStyle = "#e8e5da";
  ctx.lineWidth = 1;
  for (let y = 80; y < canvas.height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(30, y);
    ctx.lineTo(canvas.width - 30, y);
    ctx.stroke();
  }

  // Margin line
  ctx.strokeStyle = "#f3b5b5";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(50, 0);
  ctx.lineTo(50, canvas.height);
  ctx.stroke();

  // Header Title
  ctx.fillStyle = "#1e293b";
  ctx.font = "bold 24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(title, 80, 55);

  const numCols = columns.length;
  const colWidth = (canvas.width - 100) / numCols;

  columns.forEach((col, cIdx) => {
    const startX = 80 + cIdx * colWidth;
    const rightAlignX = startX + colWidth - 40;

    // Column Sub-header
    ctx.fillStyle = "#2563eb";
    ctx.font = "bold 16px -apple-system, sans-serif";
    ctx.fillText(col.title, startX + 10, 105);

    // Subtle column separator
    if (cIdx < numCols - 1) {
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(startX + colWidth - 15, 95);
      ctx.lineTo(startX + colWidth - 15, canvas.height - 80);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const startY = 160;
    const lineHeight = 55;

    ctx.font = "bold 30px 'Courier New', monospace";
    ctx.textAlign = "right";

    col.numbers.forEach((item, nIdx) => {
      const y = startY + nIdx * lineHeight;

      if (item.label) {
        ctx.save();
        ctx.textAlign = "left";
        ctx.font = "14px -apple-system, sans-serif";
        ctx.fillStyle = "#64748b";
        ctx.fillText(item.label, startX + 10, y - 6);
        ctx.restore();
      }

      if (nIdx === col.numbers.length - 1) {
        ctx.save();
        ctx.font = "bold 24px -apple-system, sans-serif";
        ctx.fillStyle = "#2563eb";
        ctx.fillText("+", startX + 30, y);
        ctx.restore();
      }

      ctx.fillStyle = "#0f172a";
      ctx.fillText(item.val.toString(), rightAlignX, y);
    });

    // Column summation line
    const dividerY = startY + col.numbers.length * lineHeight - 15;
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(startX + 30, dividerY);
    ctx.lineTo(rightAlignX + 10, dividerY);
    ctx.stroke();
  });

  return canvas.toDataURL("image/jpeg", 0.92);
}

/**
 * Full page measurement chart raw data parsed directly from Everwin Tanners - Melvisharam Measurement List
 */
export const EVERWIN_TANNERY_PRESET_DATA = {
  documentTitle: "EVERWIN TANNERS - MELVISHARAM",
  subTitle: "MEASUREMENT LIST",
  date: "21/9/06",
  notes: "Full-page multi-column measurement list with 8 vertical columns across 3 sections. Shorthand trailing hyphens (e.g. 25-, 21-) parsed as exact .0 whole square feet.",
  columns: [
    {
      title: "Sec 1 - Col 1",
      values: [24.4, 20.2, 18.0, 17.4, 21.3, 23.8, 20.4, 23.8, 22.5, 23.0, 23.8, 20.0, 17.8, 19.0, 21.0, 23.8, 22.4, 17.1, 19.2, 23.6, 24.8, 18.8, 23.3, 17.0, 20.1, 19.5, 21.4, 23.0, 18.8, 20.5],
      sum: 629.7,
    },
    {
      title: "Sec 1 - Col 2",
      values: [23.2, 21.0, 24.0, 23.1, 24.8, 20.4, 21.0, 21.4, 24.2, 20.8, 22.0, 17.8, 18.7, 17.2, 21.6, 25.5, 17.2, 14.5, 13.7, 24.1, 20.4, 14.0, 24.8, 17.2],
      sum: 492.6,
    },
    {
      title: "Sec 2 - Col 3",
      values: [24.6, 18.3, 21.7, 21.7, 18.0, 20.1, 22.7, 22.0, 16.8, 20.7, 24.2, 21.4, 24.3, 19.5, 23.2, 23.4, 21.1, 21.3, 21.4, 21.2, 21.5, 22.4, 23.2, 20.0, 20.2, 21.0, 18.3, 17.3, 24.4, 22.2],
      sum: 638.1,
    },
    {
      title: "Sec 2 - Col 4",
      values: [25.0, 24.0, 22.5, 22.7, 22.4, 19.0, 20.8, 24.0, 24.1, 21.1, 19.6, 21.8, 24.3, 21.0, 23.0, 24.7, 22.7, 17.4, 21.8, 17.2, 24.0, 23.6, 21.8, 24.7, 18.3, 17.8, 22.7, 24.5, 16.3, 17.5],
      sum: 650.3,
    },
    {
      title: "Sec 2 - Col 5",
      values: [18.7, 22.5, 20.2, 23.6, 19.2, 18.7, 20.3, 18.2, 24.6, 15.3, 17.4, 24.0, 22.0, 23.4, 17.7, 15.4, 23.2, 16.4, 21.0, 21.7, 22.0, 16.5, 25.0, 15.7, 17.4, 17.5, 21.8, 23.5, 18.7, 19.4],
      sum: 601.0,
    },
    {
      title: "Sec 2 - Col 6",
      values: [21.0, 17.3, 20.0, 24.3, 21.1, 18.7, 22.4, 20.7, 24.8, 17.7, 17.0, 24.8, 22.0, 22.8, 24.2, 20.0, 18.2, 18.1, 18.8, 16.3, 22.7, 24.0],
      sum: 456.9,
    },
    {
      title: "Sec 3 - Col 7",
      values: [23.8, 24.7, 21.5, 19.2, 23.5, 23.8, 22.0, 21.3, 21.7, 18.4, 22.7, 18.5, 17.0, 19.0, 21.5, 19.8, 23.1, 23.8, 21.7, 24.4, 20.8, 23.6, 23.0, 24.1, 24.6, 24.0, 23.2, 16.5, 24.5, 22.0],
      sum: 657.7,
    },
    {
      title: "Sec 3 - Col 8",
      values: [19.2, 21.0, 19.7, 21.0, 24.3, 19.4, 19.6, 21.0, 24.3, 19.0, 23.7, 17.3, 24.4, 14.0, 15.9, 15.8, 14.9, 14.2],
      sum: 348.7,
    },
  ],
  totalPieces: 214,
  grandTotal: 4475.0,
  averageSqFt: 20.91,
};

/**
 * Generates an authentic canvas preview simulating a full-page measurement chart (Everwin Tanners style)
 */
export function generateTanneryMeasurementChartCanvasImage(): string {
  const canvas = document.createElement("canvas");
  canvas.width = 1000;
  canvas.height = 1400; // 3:4 portrait document aspect
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // Document paper texture background
  ctx.fillStyle = "#fcfaf2";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Outer paper border
  ctx.strokeStyle = "#0d9488"; // Greenish-cyan ink typical of printed measurement sheets
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 30, canvas.width - 60, canvas.height - 60);

  // Top header block
  ctx.textAlign = "center";
  ctx.fillStyle = "#0f766e";
  ctx.font = "bold 28px 'Times New Roman', serif";
  ctx.fillText("EVERWIN TANNERS - MELVISHARAM", canvas.width / 2, 75);

  ctx.font = "bold 20px 'Times New Roman', serif";
  ctx.fillText("MEASUREMENT LIST", canvas.width / 2, 108);

  // Subheader: Date, Article
  ctx.textAlign = "left";
  ctx.font = "14px 'Times New Roman', serif";
  ctx.fillText("Date: 21/9/06", 50, 135);
  ctx.fillText("Article: Buff Calf Finished", 400, 135);
  ctx.fillText("Type: Full Page Tally", 800, 135);

  // Table Grid dimensions
  const tableX = 50;
  const tableY = 150;
  const tableWidth = canvas.width - 100;
  const tableHeight = 1120;
  const rowHeight = 35;
  const indexColWidth = 45;
  const colWidth = (tableWidth - indexColWidth) / 8;

  // Header background
  ctx.fillStyle = "#e6f4f1";
  ctx.fillRect(tableX, tableY, tableWidth, rowHeight);

  // Draw table outline
  ctx.strokeStyle = "#0f766e";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(tableX, tableY, tableWidth, tableHeight);

  // Header text
  ctx.fillStyle = "#0f766e";
  ctx.font = "bold 13px 'Times New Roman', serif";
  ctx.textAlign = "center";
  ctx.fillText("S.No", tableX + indexColWidth / 2, tableY + 22);

  for (let c = 0; c < 8; c++) {
    const colX = tableX + indexColWidth + c * colWidth;
    ctx.fillText(`C${c + 1}`, colX + colWidth / 2, tableY + 22);
  }

  // Draw 30 rows of numbers
  ctx.font = "bold 15px 'Courier New', monospace";
  for (let r = 0; r < 30; r++) {
    const rowY = tableY + rowHeight + r * rowHeight;

    // Row divider
    ctx.strokeStyle = "#ccdedb";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tableX, rowY + rowHeight);
    ctx.lineTo(tableX + tableWidth, rowY + rowHeight);
    ctx.stroke();

    // Serial number
    ctx.fillStyle = "#64748b";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(r + 1), tableX + indexColWidth / 2, rowY + 23);

    // Columns
    ctx.font = "bold 15px 'Courier New', monospace";
    for (let c = 0; c < 8; c++) {
      const colData = EVERWIN_TANNERY_PRESET_DATA.columns[c];
      const val = colData.values[r];
      if (val !== undefined) {
        const colX = tableX + indexColWidth + c * colWidth;
        // Handwritten style ink
        ctx.fillStyle = "#1e3a8a"; // Dark blue fountain pen ink
        ctx.textAlign = "right";

        // Display formatted number with trailing dash if integer
        const isInteger = Math.round(val) === val;
        const textVal = isInteger ? `${val}-` : val.toFixed(1);
        ctx.fillText(textVal, colX + colWidth - 12, rowY + 23);
      }
    }
  }

  // Vertical column grid lines
  ctx.strokeStyle = "#0f766e";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tableX + indexColWidth, tableY);
  ctx.lineTo(tableX + indexColWidth, tableY + tableHeight);
  ctx.stroke();

  for (let c = 1; c < 8; c++) {
    const colX = tableX + indexColWidth + c * colWidth;
    ctx.beginPath();
    ctx.moveTo(colX, tableY);
    ctx.lineTo(colX, tableY + tableHeight);
    ctx.stroke();
  }

  // Footer summary box
  const footerY = tableY + tableHeight + 15;
  ctx.fillStyle = "#0f766e";
  ctx.fillRect(tableX, footerY, tableWidth, 50);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 15px 'Times New Roman', serif";
  ctx.textAlign = "left";
  ctx.fillText("Total Sides / Hides: 214 Pieces", tableX + 20, footerY + 31);
  ctx.textAlign = "center";
  ctx.fillText("Avg: 20.91 Sq' Ft / Hide", tableX + tableWidth / 2, footerY + 31);
  ctx.textAlign = "right";
  ctx.fillText("GRAND TOTAL: 4,475.0 Sq' Ft", tableX + tableWidth - 20, footerY + 31);

  return canvas.toDataURL("image/jpeg", 0.92);
}

/**
 * Returns instant, client-side calculation results for presets (works 100% offline)
 */
export function getPresetCalculationResult(presetName: string): CalculationResult {
  if (presetName === "tannery-chart-fullpage") {
    const cols: VerticalColumnLine[] = EVERWIN_TANNERY_PRESET_DATA.columns.map((c, cIdx) => {
      const items: DetectedNumberItem[] = c.values.map((v, vIdx) => ({
        id: `tannery-col${cIdx + 1}-item${vIdx + 1}`,
        value: v,
        rawText: v.toString(),
        columnIndex: cIdx,
        label: `P${vIdx + 1}`,
      }));
      const safe = computeSafeSum(items);
      return {
        id: `col-${cIdx + 1}`,
        title: c.title,
        items,
        sum: safe.sum,
        formula: safe.formula,
        maxDecimals: safe.maxDecimals,
      };
    });

    const allItems = cols.flatMap((c) => c.items);
    const colSums = cols.map((c) => c.sum);
    const grand = computeSafeSum(colSums);

    return {
      success: true,
      detectedTitle: "EVERWIN TANNERS - MELVISHARAM (MEASUREMENT LIST)",
      notes: "Full-page multi-column measurement list with 8 vertical columns across 3 sections.",
      items: allItems,
      sum: grand.sum,
      formula: grand.formula,
      count: allItems.length,
      maxDecimals: grand.maxDecimals,
      columns: cols,
      grandTotal: grand.sum,
      grandFormula: colSums.join(" + ") + " = " + grand.sum,
      totalNumbersCount: allItems.length,
      isMeasurementChart: true,
      measurementMetadata: {
        isMeasurementChart: true,
        companyName: "EVERWIN TANNERS - MELVISHARAM",
        documentTitle: "MEASUREMENT LIST",
        date: "21/9/06",
        article: "Buff Calf Finished",
        totalPieces: 214,
        totalSqFt: 4475.0,
        averageSqFt: 20.91,
        unit: "Sq. Ft.",
      },
    };
  }

  if (presetName === "example-33-32") {
    const items: DetectedNumberItem[] = [
      { id: "item-1", value: 33.3, rawText: "33.3", label: "Item 1", columnIndex: 0 },
      { id: "item-2", value: 32.2, rawText: "32.2", label: "Item 2", columnIndex: 0 },
    ];
    const safe = computeSafeSum(items);
    const col: VerticalColumnLine = {
      id: "col-1",
      title: "Vertical Column",
      items,
      sum: safe.sum,
      formula: safe.formula,
      maxDecimals: safe.maxDecimals,
    };
    return {
      success: true,
      detectedTitle: "Vertical Addition (33.3 + 32.2)",
      notes: "Sample verified vertical addition with decimals.",
      items,
      sum: safe.sum,
      formula: safe.formula,
      count: 2,
      maxDecimals: safe.maxDecimals,
      columns: [col],
      grandTotal: safe.sum,
      grandFormula: safe.formula,
      totalNumbersCount: 2,
    };
  }

  if (presetName === "multi-vertical-lines") {
    const col1Items: DetectedNumberItem[] = [
      { id: "c1-1", value: 45.5, rawText: "45.5", columnIndex: 0 },
      { id: "c1-2", value: 120.0, rawText: "120.0", columnIndex: 0 },
      { id: "c1-3", value: 84.5, rawText: "84.5", columnIndex: 0 },
    ];
    const col2Items: DetectedNumberItem[] = [
      { id: "c2-1", value: 310.25, rawText: "310.25", columnIndex: 1 },
      { id: "c2-2", value: 95.75, rawText: "95.75", columnIndex: 1 },
      { id: "c2-3", value: 144.0, rawText: "144.0", columnIndex: 1 },
    ];
    const s1 = computeSafeSum(col1Items);
    const s2 = computeSafeSum(col2Items);
    const col1: VerticalColumnLine = { id: "col-1", title: "Batch 1", items: col1Items, sum: s1.sum, formula: s1.formula, maxDecimals: s1.maxDecimals };
    const col2: VerticalColumnLine = { id: "col-2", title: "Batch 2", items: col2Items, sum: s2.sum, formula: s2.formula, maxDecimals: s2.maxDecimals };
    const grand = computeSafeSum([s1.sum, s2.sum]);

    return {
      success: true,
      detectedTitle: "2 Vertical Lines Addition",
      notes: "Multi-column vertical summation test.",
      items: [...col1Items, ...col2Items],
      sum: grand.sum,
      formula: grand.formula,
      count: 6,
      maxDecimals: grand.maxDecimals,
      columns: [col1, col2],
      grandTotal: grand.sum,
      grandFormula: `${s1.sum} + ${s2.sum} = ${grand.sum}`,
      totalNumbersCount: 6,
    };
  }

  if (presetName === "receipt-4-items") {
    const items: DetectedNumberItem[] = [
      { id: "r-1", value: 12.5, rawText: "12.50", label: "Item 1", columnIndex: 0 },
      { id: "r-2", value: 45.0, rawText: "45.00", label: "Item 2", columnIndex: 0 },
      { id: "r-3", value: 8.25, rawText: "8.25", label: "Item 3", columnIndex: 0 },
      { id: "r-4", value: 14.25, rawText: "14.25", label: "Item 4", columnIndex: 0 },
    ];
    const safe = computeSafeSum(items);
    const col: VerticalColumnLine = { id: "col-1", title: "Receipt Column", items, sum: safe.sum, formula: safe.formula, maxDecimals: safe.maxDecimals };
    return {
      success: true,
      detectedTitle: "Receipt Column Sum",
      notes: "Grocery receipt column addition.",
      items,
      sum: safe.sum,
      formula: safe.formula,
      count: 4,
      maxDecimals: safe.maxDecimals,
      columns: [col],
      grandTotal: safe.sum,
      grandFormula: safe.formula,
      totalNumbersCount: 4,
    };
  }

  // Default ledger sample
  const items: DetectedNumberItem[] = [
    { id: "l-1", value: 105.4, rawText: "105.4", label: "Account A", columnIndex: 0 },
    { id: "l-2", value: 210.6, rawText: "210.6", label: "Account B", columnIndex: 0 },
  ];
  const safe = computeSafeSum(items);
  const col: VerticalColumnLine = { id: "col-1", title: "Ledger", items, sum: safe.sum, formula: safe.formula, maxDecimals: safe.maxDecimals };
  return {
    success: true,
    detectedTitle: "Ledger Account Sum",
    notes: "Ledger entries calculation.",
    items,
    sum: safe.sum,
    formula: safe.formula,
    count: 2,
    maxDecimals: safe.maxDecimals,
    columns: [col],
    grandTotal: safe.sum,
    grandFormula: safe.formula,
    totalNumbersCount: 2,
  };
}
