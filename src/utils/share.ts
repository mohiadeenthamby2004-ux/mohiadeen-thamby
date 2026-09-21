import { DetectedNumberItem, VerticalColumnLine } from "../types";
import { formatVerticalColumn } from "./math";

export interface ShareCalculationParams {
  title: string;
  items: DetectedNumberItem[];
  sum: number;
  columns?: VerticalColumnLine[];
  grandTotal?: number;
  grandFormula?: string;
  imageSrc?: string | null;
}

export interface ShareResult {
  success: boolean;
  type: "native_share" | "clipboard" | "aborted" | "error";
  message?: string;
}

/**
 * Builds clean readable share text for single or multi-column calculations
 */
export function buildShareText({
  title,
  items,
  sum,
  columns,
  grandTotal,
  grandFormula,
}: Omit<ShareCalculationParams, "imageSrc">): string {
  const isMulti = Array.isArray(columns) && columns.length > 1;

  if (isMulti && columns) {
    const linesText = columns
      .map((col, idx) => {
        const ascii = formatVerticalColumn(col.items, col.sum);
        return `📊 ${col.title || `Line ${idx + 1}`}:\n${ascii}`;
      })
      .join("\n\n");

    const totalVal = grandTotal ?? sum;
    const formulaLine = grandFormula ? `\nFormula: ${grandFormula}` : "";

    return `🧮 ${title || "Vertical Column Calculation"}\n\n${linesText}\n\n====================\n⭐ GRAND TOTAL: ${totalVal}${formulaLine}\n\nCalculated with Measurement Chart`;
  }

  // Single column
  const ascii = formatVerticalColumn(items, sum);
  return `🧮 ${title || "Vertical Addition Calculation"}\n\n${ascii}\n\n⭐ Final Result: ${sum}\nFormula: ${items.map((i) => i.value).join(" + ")} = ${sum}\n\nCalculated with Measurement Chart`;
}

/**
 * Converts a base64 data URL into a standard File object for Web Share API Level 2
 */
async function dataUrlToFile(dataUrl: string, filename = "vertical-calculation.jpg"): Promise<File | null> {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return new File([blob], filename, { type: blob.type || "image/jpeg" });
  } catch (err) {
    console.warn("Could not convert image to File for Web Share:", err);
    return null;
  }
}

/**
 * Shares calculation using Web Share API if supported, or gracefully falls back to clipboard
 */
export async function shareCalculation(params: ShareCalculationParams): Promise<ShareResult> {
  const textContent = buildShareText(params);
  const shareTitle = params.title || "Measurement Chart Calculation Result";

  // Check if Web Share API is available in current browser / context
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      const shareData: ShareData = {
        title: shareTitle,
        text: textContent,
      };

      // If an image is present and Web Share Level 2 can share files, attach the photo
      if (params.imageSrc && typeof navigator.canShare === "function") {
        const file = await dataUrlToFile(params.imageSrc);
        if (file) {
          const testData = { ...shareData, files: [file] };
          if (navigator.canShare(testData)) {
            shareData.files = [file];
          }
        }
      }

      await navigator.share(shareData);
      return {
        success: true,
        type: "native_share",
        message: "Calculation shared successfully!",
      };
    } catch (err: any) {
      if (err.name === "AbortError") {
        // User closed or dismissed the share sheet
        return {
          success: false,
          type: "aborted",
          message: "Share dialog cancelled.",
        };
      }
      console.warn("Web Share failed, falling back to clipboard:", err);
    }
  }

  // Fallback: Copy formatted summary to clipboard
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(textContent);
      return {
        success: true,
        type: "clipboard",
        message: "Calculation copied to clipboard! You can now paste and send it anywhere.",
      };
    }
  } catch (clipErr) {
    console.warn("Clipboard fallback error:", clipErr);
  }

  return {
    success: false,
    type: "error",
    message: "Sharing is not supported on this browser.",
  };
}
