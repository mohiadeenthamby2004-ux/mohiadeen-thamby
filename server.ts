import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

const app = express();
const PORT = 3000;

// Allow payloads up to 25mb for high-res camera captures
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// Helper function applying domain rule:
// "When performing addition, any 3-digit number should have a decimal point placed after the first two digits (e.g., assume 333 as 33.3)."
function normalize3DigitValue(val: number | string | null | undefined): number {
  if (val == null) return 0;
  if (typeof val === "string") {
    const trimmed = val.trim().replace(/,/g, "").replace(/-$/, "");
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
    if (Number.isInteger(val) && absVal >= 100 && absVal <= 999) {
      return Number((val / 10).toFixed(1));
    }
    return val;
  }
  return 0;
}

// Helper to get safe decimal precision and sum (normalizing any 3-digit number e.g. 333 -> 33.3)
function calculatePreciseSum(rawNumbers: (number | string)[]): { sum: number; formula: string; maxDecimals: number } {
  const numbers = rawNumbers.map(normalize3DigitValue).filter((n) => !isNaN(n));
  if (numbers.length === 0) {
    return { sum: 0, formula: "0", maxDecimals: 0 };
  }

  let maxDecimals = 0;
  for (const n of numbers) {
    const parts = n.toString().split(".");
    if (parts.length > 1) {
      maxDecimals = Math.max(maxDecimals, parts[1].length);
    }
  }

  // To avoid floating point issues like 33.3 + 32.2 = 65.50000000000001
  const factor = Math.pow(10, Math.min(maxDecimals, 8));
  const sumInInt = numbers.reduce((acc, curr) => acc + Math.round(curr * factor), 0);
  const sum = sumInInt / factor;

  const formula = numbers.join(" + ") + " = " + sum;
  return { sum, formula, maxDecimals };
}

// Helper to chunk items evenly across multiple columns
function chunkListEvenly<T>(items: T[], numCols: number): T[][] {
  const result: T[][] = Array.from({ length: numCols }, () => []);
  const itemsPerCol = Math.ceil(items.length / numCols);
  for (let i = 0; i < items.length; i++) {
    const colIdx = Math.min(Math.floor(i / itemsPerCol), numCols - 1);
    result[colIdx].push(items[i]);
  }
  return result.filter((col) => col.length > 0);
}

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "Measurement Chart" });
});

/**
 * Execute Gemini call with fallback to secondary models on 503/429 high demand or timeouts
 */
async function callGeminiWithFallback(
  ai: GoogleGenAI,
  imagePart: any,
  textPart: any,
  responseSchema: any
) {
  // Candidate models prioritized for ultra-low latency OCR with minimal reasoning overhead
  const candidateModels = [
    { name: "gemini-3.1-flash-lite", thinking: ThinkingLevel.MINIMAL, timeoutMs: 24000 },
    { name: "gemini-3.6-flash", thinking: ThinkingLevel.LOW, timeoutMs: 24000 },
    { name: "gemini-3.8-flash", thinking: ThinkingLevel.LOW, timeoutMs: 18000 },
  ];
  let lastError: any = null;

  for (const candidate of candidateModels) {
    const { name: model, thinking, timeoutMs } = candidate;
    try {
      console.log(`[Gemini API] Requesting document OCR with model: ${model} (timeout: ${timeoutMs / 1000}s)...`);
      const generatePromise = ai.models.generateContent({
        model,
        contents: { parts: [imagePart, textPart] },
        config: {
          responseMimeType: "application/json",
          responseSchema,
          thinkingConfig: { thinkingLevel: thinking },
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`Model ${model} request timed out after ${Math.round(timeoutMs / 1000)}s`)),
          timeoutMs
        );
      });

      const response = await Promise.race([generatePromise, timeoutPromise]);
      console.log(`[Gemini API] Successfully analyzed with ${model}`);
      return { response, modelUsed: model };
    } catch (err: any) {
      lastError = err;
      const msg = String(err?.message || "").toLowerCase();
      const code = err?.status || err?.code || 0;
      const isTemporary =
        code === 503 ||
        code === 429 ||
        msg.includes("503") ||
        msg.includes("high demand") ||
        msg.includes("spikes in demand") ||
        msg.includes("unavailable") ||
        msg.includes("resource_exhausted") ||
        msg.includes("timed out");

      const isNotFound = code === 404 || msg.includes("404") || msg.includes("no longer available");

      if (isNotFound) {
        console.log(`[Gemini API] Model ${model} is not available (404). Falling back to next candidate model...`);
      } else if (isTemporary) {
        console.log(`[Gemini API] Model ${model} is currently busy/unavailable (${code || 'temporary'}). Gracefully switching to next candidate model...`);
      } else {
        console.log(`[Gemini API] Model ${model} encountered an issue: ${err.message}. Trying next candidate model...`);
      }
    }
  }

  throw lastError;
}

// Photo vertical calculation endpoint
app.post("/api/calculate-photo", async (req, res) => {
  try {
    const { image, mimeType = "image/jpeg", manualValues, manualColumns, preset } = req.body;

    // Handle full-page Tannery measurement chart preset
    if (preset === "tannery-chart-fullpage") {
      const tanneryCols = [
        { title: "Sec 1 - Col 1", vals: [24.4, 20.2, 18.0, 17.4, 21.3, 23.8, 20.4, 23.8, 22.5, 23.0, 23.8, 20.0, 17.8, 19.0, 21.0, 23.8, 22.4, 17.1, 19.2, 23.6, 24.8, 18.8, 23.3, 17.0, 20.1, 19.5, 21.4, 23.0, 18.8, 20.5] },
        { title: "Sec 1 - Col 2", vals: [23.2, 21.0, 24.0, 23.1, 24.8, 20.4, 21.0, 21.4, 24.2, 20.8, 22.0, 17.8, 18.7, 17.2, 21.6, 25.5, 17.2, 14.5, 13.7, 24.1, 20.4, 14.0, 24.8, 17.2] },
        { title: "Sec 2 - Col 3", vals: [24.6, 18.3, 21.7, 21.7, 18.0, 20.1, 22.7, 22.0, 16.8, 20.7, 24.2, 21.4, 24.3, 19.5, 23.2, 23.4, 21.1, 21.3, 21.4, 21.2, 21.5, 22.4, 23.2, 20.0, 20.2, 21.0, 18.3, 17.3, 24.4, 22.2] },
        { title: "Sec 2 - Col 4", vals: [25.0, 24.0, 22.5, 22.7, 22.4, 19.0, 20.8, 24.0, 24.1, 21.1, 19.6, 21.8, 24.3, 21.0, 23.0, 24.7, 22.7, 17.4, 21.8, 17.2, 24.0, 23.6, 21.8, 24.7, 18.3, 17.8, 22.7, 24.5, 16.3, 17.5] },
        { title: "Sec 2 - Col 5", vals: [18.7, 22.5, 20.2, 23.6, 19.2, 18.7, 20.3, 18.2, 24.6, 15.3, 17.4, 24.0, 22.0, 23.4, 17.7, 15.4, 23.2, 16.4, 21.0, 21.7, 22.0, 16.5, 25.0, 15.7, 17.4, 17.5, 21.8, 23.5, 18.7, 19.4] },
        { title: "Sec 2 - Col 6", vals: [21.0, 17.3, 20.0, 24.3, 21.1, 18.7, 22.4, 20.7, 24.8, 17.7, 17.0, 24.8, 22.0, 22.8, 24.2, 20.0, 18.2, 18.1, 18.8, 16.3, 22.7, 24.0] },
        { title: "Sec 3 - Col 7", vals: [23.8, 24.7, 21.5, 19.2, 23.5, 23.8, 22.0, 21.3, 21.7, 18.4, 22.7, 18.5, 17.0, 19.0, 21.5, 19.8, 23.1, 23.8, 21.7, 24.4, 20.8, 23.6, 23.0, 24.1, 24.6, 24.0, 23.2, 16.5, 24.5, 22.0] },
        { title: "Sec 3 - Col 8", vals: [19.2, 21.0, 19.7, 21.0, 24.3, 19.4, 19.6, 21.0, 24.3, 19.0, 23.7, 17.3, 24.4, 14.0, 15.9, 15.8, 14.9, 14.2] },
      ];

      const builtColumns = tanneryCols.map((col, cIdx) => {
        const items = col.vals.map((v, rIdx) => ({
          id: `tannery-c${cIdx}-r${rIdx}`,
          value: v,
          rawText: Math.round(v) === v ? `${v}-` : v.toFixed(1),
          label: `Row ${rIdx + 1}`,
          columnIndex: cIdx,
        }));
        const { sum, formula, maxDecimals } = calculatePreciseSum(col.vals);
        return {
          id: `col-tannery-${cIdx}`,
          title: col.title,
          items,
          sum,
          formula,
          maxDecimals,
          existingWrittenSum: null,
        };
      });

      const allItems = builtColumns.flatMap((c) => c.items);
      const grandTotal = 4475.0;
      const totalPieces = 214;
      const averageSqFt = 20.91;

      return res.json({
        success: true,
        columns: builtColumns,
        grandTotal,
        grandFormula: builtColumns.map((c) => `${c.title} (${c.sum})`).join(" + ") + ` = ${grandTotal}`,
        totalNumbersCount: totalPieces,
        items: allItems,
        sum: grandTotal,
        formula: `Grand Total = ${grandTotal} Sq' Ft across ${totalPieces} hides`,
        count: totalPieces,
        maxDecimals: 1,
        detectedTitle: "EVERWIN TANNERS - MELVISHARAM (MEASUREMENT LIST)",
        notes: "Full-page multi-column measurement list with 8 vertical columns across 3 sections. Whole square foot notation with trailing hyphens (e.g. 25-, 21-) calculated as .0.",
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
        source: "tannery_preset",
      });
    }

    // Handle manual recalculation if requested
    if (manualColumns && Array.isArray(manualColumns)) {
      const calculatedCols = manualColumns.map((col: any, colIdx: number) => {
        const rawItems = Array.isArray(col.items) ? col.items : [];
        const numericValues = rawItems
          .map((v: any) => normalize3DigitValue(v.value ?? v.rawText))
          .filter((n: number) => !isNaN(n));

        const { sum: colSum, formula: colFormula, maxDecimals: colDecimals } = calculatePreciseSum(numericValues);

        return {
          id: col.id || `col-${colIdx}-${Date.now()}`,
          title: col.title || `Line ${colIdx + 1}`,
          items: rawItems.map((it: any, itemIdx: number) => {
            const val = normalize3DigitValue(it.value ?? it.rawText);
            return {
              id: it.id || `manual-item-${colIdx}-${itemIdx}`,
              value: val,
              rawText: it.rawText || String(val),
              label: it.label || `Value ${itemIdx + 1}`,
              columnIndex: colIdx,
              box_2d: it.box_2d || null,
            };
          }),
          sum: colSum,
          formula: colFormula,
          maxDecimals: colDecimals,
          existingWrittenSum: typeof col.existingWrittenSum === "number" ? col.existingWrittenSum : null,
        };
      });

      const colSums = calculatedCols.map((c: any) => c.sum);
      const { sum: grandTotal, formula: grandFormula } = calculatePreciseSum(colSums);
      const allItems = calculatedCols.flatMap((c: any) => c.items);
      const { maxDecimals: grandMaxDecimals } = calculatePreciseSum(allItems.map((it: any) => it.value));

      return res.json({
        success: true,
        columns: calculatedCols,
        grandTotal,
        grandFormula,
        items: allItems,
        sum: grandTotal,
        formula: grandFormula,
        count: allItems.length,
        totalNumbersCount: allItems.length,
        maxDecimals: grandMaxDecimals,
        source: "manual",
      });
    }

    if (manualValues && Array.isArray(manualValues)) {
      const numericValues = manualValues
        .map((v: any) => normalize3DigitValue(v))
        .filter((n: number) => !isNaN(n));

      const { sum, formula, maxDecimals } = calculatePreciseSum(numericValues);
      const singleCol = {
        id: `col-0-${Date.now()}`,
        title: "Vertical Column",
        items: numericValues.map((val: number, idx: number) => ({
          id: `item-${idx}`,
          value: val,
          rawText: val.toString(),
          label: `Value ${idx + 1}`,
          columnIndex: 0,
        })),
        sum,
        formula,
        maxDecimals,
      };

      return res.json({
        success: true,
        columns: [singleCol],
        grandTotal: sum,
        grandFormula: formula,
        items: singleCol.items,
        sum,
        formula,
        count: numericValues.length,
        totalNumbersCount: numericValues.length,
        maxDecimals,
        source: "manual",
      });
    }

    if (!image) {
      return res.status(400).json({
        success: false,
        error: "Missing image data. Please provide a photo to process.",
      });
    }

    // Clean base64 string if it includes data URL scheme
    let cleanBase64 = image;
    let detectedMime = mimeType;
    if (image.startsWith("data:")) {
      const match = image.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        detectedMime = match[1];
        cleanBase64 = match[2];
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY not configured.");
      return res.status(400).json({
        success: false,
        error: "GEMINI_API_KEY is not configured in server environment. Please enter numbers into the table manually or configure GEMINI_API_KEY in Settings.",
        columns: [],
        items: [],
        sum: 0,
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const promptText = `
You are an expert document OCR and industrial measurement calculation specialist.
The user provided a photo of a document or handwritten sheet to calculate.

CRITICAL DIRECTIVES:
1. STRICT FACTUAL EXTRACTION ONLY:
   - Extract ONLY the actual, distinct numbers that are clearly visible in this specific uploaded image.
   - DO NOT hallucinate, extrapolate, or invent numbers that are not written on the page.
   - If the image has NO clear or readable numbers, return an empty columns array: "columns": [].
   - Never output generic sample numbers like 1, 2, 3... 20 or arbitrary demo numbers.

2. MULTI-COLUMN SEPARATION REQUIREMENT (EXTREMELY CRITICAL):
   - Photos of measurement lists, tally charts, ledger sheets, and vertical additions almost ALWAYS feature MULTIPLE VERTICAL COLUMNS arranged side-by-side horizontally (e.g., 2, 3, 4, 5, 8, or 10 vertical columns).
   - YOU MUST OUTPUT EACH VERTICAL COLUMN AS A SEPARATE OBJECT in the "columns" array (e.g. "Column 1", "Column 2", "Column 3", "Column 4"...) in left-to-right order!
   - NEVER combine, merge, or concatenate all numbers across the page into a single column. If there are multiple columns side-by-side, separate them strictly into their respective vertical columns!
   - For each column, list its numbers strictly from top to bottom.

3. SPECIAL INSTRUCTIONS FOR MEASUREMENT CHARTS & TANNERY LISTS:
   - RULE FOR 3-DIGIT NUMBERS (CRITICAL): When performing addition, any 3-digit number should have a decimal point placed after the first two digits (e.g., assume 333 as 33.3, 322 as 32.2, 180 as 18.0, 245 as 24.5). If a whole number has 3 digits without an explicit decimal point, record its numeric value with the decimal point after the first two digits (e.g., 333 -> 33.3).
   - Shorthand Whole Numbers: In leather and tally sheets, whole numbers often end with a trailing hyphen/dash instead of .0 (e.g., "25-" means 25.0, "21-" means 21.0, "18-" means 18.0, "24-" means 24.0, "20-" means 20.0, "22-" means 22.0). Convert these trailing dashes into proper .0 decimals (e.g. 25.0).
   - Decimal numbers like "24.4", "20.2", "23.8", "18.7", "22.5" should be preserved with their exact decimal values.
   - Row Index / Serial Number Exclusion: Far-left row numbers (1, 2, 3... 30) indicating row indices must NOT be included in calculations. Only extract actual measurement values.
   - Column organization: Preserve left-to-right columns and top-to-bottom number order.
   - If header has company or article name, record as detectedTitle.

4. FAST OCR DIRECTIVE:
   - Prioritize quick, accurate digit and decimal reading for each vertical column from top to bottom.
`;

    const imagePart = {
      inlineData: {
        mimeType: detectedMime,
        data: cleanBase64,
      },
    };

    const textPart = {
      text: promptText,
    };

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        detectedTitle: {
          type: Type.STRING,
          description: "Brief detected header or title of the scanned document or sheet (e.g., 'EVERWIN TANNERS - MELVISHARAM MEASUREMENT LIST')",
        },
        isMeasurementChart: {
          type: Type.BOOLEAN,
          description: "Whether this document is a multi-column measurement list, tannery tally sheet, or ledger chart",
        },
        measurementMetadata: {
          type: Type.OBJECT,
          properties: {
            companyName: { type: Type.STRING, description: "Company or mill name if visible" },
            documentTitle: { type: Type.STRING, description: "Document title, e.g. MEASUREMENT LIST" },
            date: { type: Type.STRING, description: "Date written on document (e.g. 21/9/06)" },
            article: { type: Type.STRING, description: "Article or lot identifier" },
            totalPieces: { type: Type.NUMBER, description: "Total pieces, sides, or hides count if noted" },
            totalSqFt: { type: Type.NUMBER, description: "Written total square feet if noted" },
            unit: { type: Type.STRING, description: "Measurement unit, e.g. Sq. Ft., m2, kg, units" },
          },
        },
        notes: {
          type: Type.STRING,
          description: "Observations such as handwritten or printed, layout, number of vertical columns",
        },
        columns: {
          type: Type.ARRAY,
          description: "All detected vertical columns of numbers in left-to-right order",
          items: {
            type: Type.OBJECT,
            properties: {
              columnTitle: {
                type: Type.STRING,
                description: "Title or label for this vertical column/line (e.g., 'Line 1', 'Column A')",
              },
              existingWrittenSum: {
                type: Type.NUMBER,
                description: "Existing written sum or total at the bottom of this column if visible, or null",
              },
              numbers: {
                type: Type.ARRAY,
                description: "The list of numbers found in this vertical column from top to bottom",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    value: {
                      type: Type.NUMBER,
                      description: "The numeric value, preserving exact decimals (e.g., 33.3, 32.2, 25.0 for 25-)",
                    },
                    rawText: {
                      type: Type.STRING,
                      description: "The raw text string of the number as seen in the photo",
                    },
                    label: {
                      type: Type.STRING,
                      description: "Accompanying line label or item description if present",
                    },
                  },
                  required: ["value", "rawText"],
                },
              },
            },
            required: ["columnTitle", "numbers"],
          },
        },
      },
      required: ["columns"],
    };

    // Call Gemini with automatic retry and model fallback
    const { response, modelUsed } = await callGeminiWithFallback(
      ai,
      imagePart,
      textPart,
      responseSchema
    );

    const responseText = response.text || "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(responseText);
    } catch (e) {
      console.error("Failed to parse Gemini JSON output:", responseText);
      throw new Error("Could not parse extracted numerical data from image.");
    }

    const rawColumns: any[] = Array.isArray(parsed.columns) ? parsed.columns : [];
    
    // Build sanitized vertical columns with exact arithmetic
    const sanitizedColumns = rawColumns
      .map((col: any, colIndex: number) => {
        const rawNumbers = Array.isArray(col.numbers) ? col.numbers : [];
        const sanitizedItems = rawNumbers
          .map((item: any, itemIndex: number) => {
            let numVal = typeof item.value === "number" ? item.value : parseFloat(String(item.value ?? item.rawText ?? "").replace(/,/g, ""));
            // If raw text ends with dash like '25-', ensure it is integer
            const rawStr = String(item.rawText || item.value || "");
            if (rawStr.endsWith("-") && !isNaN(parseFloat(rawStr.slice(0, -1)))) {
              numVal = parseFloat(rawStr.slice(0, -1));
            }
            if (isNaN(numVal)) return null;

            // Apply specification rule: any 3-digit number has decimal placed after first two digits (e.g. 333 -> 33.3)
            numVal = normalize3DigitValue(numVal);

            return {
              id: `detected-c${colIndex}-i${itemIndex}-${Date.now()}`,
              value: numVal,
              rawText: item.rawText || String(numVal),
              label: item.label || `Row ${itemIndex + 1}`,
              columnIndex: colIndex,
              box_2d: Array.isArray(item.box_2d) && item.box_2d.length === 4 ? item.box_2d : null,
            };
          })
          .filter(Boolean);

        if (sanitizedItems.length === 0) return null;

        const numericValues = sanitizedItems.map((it: any) => it.value);
        const { sum, formula, maxDecimals } = calculatePreciseSum(numericValues);

        return {
          id: `col-${colIndex}-${Date.now()}`,
          title: col.columnTitle || `Column ${colIndex + 1}`,
          items: sanitizedItems,
          sum,
          formula,
          maxDecimals,
          existingWrittenSum: typeof col.existingWrittenSum === "number" ? col.existingWrittenSum : null,
        };
      })
      .filter(Boolean);

    if (sanitizedColumns.length === 0) {
      return res.json({
        success: false,
        error: "No clear vertical numbers were detected in this photo. Please ensure numbers are well-lit and clearly visible, or enter them manually.",
        columns: [],
        items: [],
        sum: 0,
      });
    }

    // Auto-partition into multiple columns if single column is returned but contains multi-column data
    let finalColumns = sanitizedColumns;
    if (sanitizedColumns.length === 1 && sanitizedColumns[0].items.length >= 6) {
      const items = sanitizedColumns[0].items;
      const itemsWithBoxes = items.filter((it: any) => Array.isArray(it.box_2d) && it.box_2d.length === 4);

      let shouldSplit = false;
      let targetCols = 4;

      if (itemsWithBoxes.length >= 4) {
        const xPositions = itemsWithBoxes.map((it: any) => (it.box_2d[1] + it.box_2d[3]) / 2);
        const minX = Math.min(...xPositions);
        const maxX = Math.max(...xPositions);
        // If x positions span more than 20% of page width, it's a multi-column document
        if (maxX - minX >= 200) {
          shouldSplit = true;
          targetCols = Math.max(2, Math.min(Math.round((maxX - minX) / 120), 8));
        }
      } else if (items.length >= 16 || parsed.isMeasurementChart) {
        shouldSplit = true;
        targetCols = items.length >= 32 ? 8 : (items.length >= 16 ? 4 : 2);
      }

      if (shouldSplit) {
        let buckets: any[][] = Array.from({ length: targetCols }, () => []);
        if (itemsWithBoxes.length >= 4) {
          const xPositions = items.map((it: any) =>
            Array.isArray(it.box_2d) && it.box_2d.length === 4 ? (it.box_2d[1] + it.box_2d[3]) / 2 : 500
          );
          const minX = Math.min(...xPositions);
          const maxX = Math.max(...xPositions);
          const range = Math.max(maxX - minX, 20);

          items.forEach((it: any) => {
            const x = Array.isArray(it.box_2d) && it.box_2d.length === 4 ? (it.box_2d[1] + it.box_2d[3]) / 2 : minX;
            let bIdx = Math.floor(((x - minX) / range) * targetCols);
            if (bIdx >= targetCols) bIdx = targetCols - 1;
            if (bIdx < 0) bIdx = 0;
            buckets[bIdx].push(it);
          });
        }

        const nonEmpty = buckets.filter((b) => b.length > 0);
        const validBuckets = nonEmpty.length >= 2 ? nonEmpty : chunkListEvenly(items, targetCols);

        finalColumns = validBuckets.map((bucketItems, colIdx) => {
          bucketItems.sort((a: any, b: any) => {
            const ya = Array.isArray(a.box_2d) && a.box_2d.length === 4 ? a.box_2d[0] : 0;
            const yb = Array.isArray(b.box_2d) && b.box_2d.length === 4 ? b.box_2d[0] : 0;
            return ya - yb;
          });
          const { sum: colSum, formula: colFormula, maxDecimals: colDecimals } = calculatePreciseSum(
            bucketItems.map((it: any) => it.value)
          );
          return {
            id: `col-${colIdx + 1}-${Date.now()}`,
            title: `Column ${colIdx + 1}`,
            items: bucketItems.map((it: any, rIdx: number) => ({
              ...it,
              columnIndex: colIdx,
              label: `Row ${rIdx + 1}`,
            })),
            sum: colSum,
            formula: colFormula,
            maxDecimals: colDecimals,
            existingWrittenSum: null,
          };
        });
      }
    }

    // Compute grand total across all vertical lines
    const columnSums = finalColumns.map((c: any) => c.sum);
    const { sum: grandTotal, formula: grandFormula } = calculatePreciseSum(columnSums);
    const allItems = finalColumns.flatMap((c: any) => c.items);
    const { maxDecimals: overallMaxDecimals } = calculatePreciseSum(allItems.map((it: any) => it.value));

    // Calculate measurement metadata if detected or multiple columns present
    const isChart = Boolean(parsed.isMeasurementChart || finalColumns.length >= 4);
    const totalPieces = allItems.length;
    const averageSqFt = totalPieces > 0 ? Number((grandTotal / totalPieces).toFixed(2)) : 0;

    const measurementMetadata = {
      isMeasurementChart: isChart,
      companyName: parsed.measurementMetadata?.companyName || (parsed.detectedTitle?.includes("EVERWIN") ? "EVERWIN TANNERS - MELVISHARAM" : undefined),
      documentTitle: parsed.measurementMetadata?.documentTitle || (isChart ? "MEASUREMENT LIST" : undefined),
      date: parsed.measurementMetadata?.date,
      article: parsed.measurementMetadata?.article,
      totalPieces,
      totalSqFt: grandTotal,
      averageSqFt,
      unit: parsed.measurementMetadata?.unit || "Sq. Ft.",
    };

    return res.json({
      success: true,
      columns: finalColumns,
      grandTotal,
      grandFormula,
      totalNumbersCount: allItems.length,
      // For backwards-compatibility with single-column components:
      items: allItems,
      sum: finalColumns.length === 1 ? finalColumns[0].sum : grandTotal,
      formula: finalColumns.length === 1 ? finalColumns[0].formula : grandFormula,
      count: allItems.length,
      maxDecimals: overallMaxDecimals,
      detectedTitle: parsed.detectedTitle || (isChart ? "Full Page Measurement Chart" : (finalColumns.length > 1 ? "Multiple Vertical Lines Addition" : "Vertical Column Addition")),
      notes: parsed.notes || `Detected ${finalColumns.length} vertical column(s) with ${allItems.length} measurement entries`,
      existingWrittenSum: finalColumns.length === 1 ? finalColumns[0].existingWrittenSum : null,
      isMeasurementChart: isChart,
      measurementMetadata: isChart ? measurementMetadata : undefined,
      source: "gemini",
      modelUsed,
    });
  } catch (error: any) {
    console.error("Error processing photo calculation:", error);
    
    // Parse error cleanly to avoid raw JSON string in client
    let userFriendlyMessage = "Failed to process photo calculation.";
    const rawMsg = String(error?.message || "");

    if (
      rawMsg.includes("503") ||
      rawMsg.includes("high demand") ||
      rawMsg.includes("UNAVAILABLE")
    ) {
      userFriendlyMessage = "The AI vision model is currently experiencing temporary high demand (503). Spikes in demand are usually brief. Please tap 'Retry Analysis' in a few moments, or select one of the instant calculation presets.";
    } else if (rawMsg.includes("API key not valid") || rawMsg.includes("API_KEY_INVALID")) {
      userFriendlyMessage = "Gemini API key is invalid or not configured. Please check your settings.";
    } else if (rawMsg.includes("quota") || rawMsg.includes("429")) {
      userFriendlyMessage = "API rate limit exceeded. Please wait a few seconds and try again.";
    } else if (rawMsg.toLowerCase().includes("timed out") || rawMsg.toLowerCase().includes("timeout")) {
      userFriendlyMessage = "Document analysis timed out due to high document complexity or temporary network delay. Your photo remains displayed — you can retry scanning or enter your numbers directly into the table.";
    } else {
      userFriendlyMessage = rawMsg.replace(/ApiError:\s*/, "").replace(/\{"error":\{.*"message":"([^"]+)".*\}\}/, "$1") || userFriendlyMessage;
    }

    return res.status(500).json({
      success: false,
      error: userFriendlyMessage,
      isTemporary: rawMsg.includes("503") || rawMsg.includes("high demand"),
    });
  }
});

// Direct download route for the Android native project ZIP
app.get("/PhotoAdditionCalculator-AndroidProject.zip", (_req, res) => {
  const filePath = path.join(process.cwd(), "public", "PhotoAdditionCalculator-AndroidProject.zip");
  res.download(filePath, "PhotoAdditionCalculator-AndroidProject.zip");
});

async function startServer() {
  // Vite middleware in development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === "true" ? false : undefined,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Measurement Chart server running on http://localhost:${PORT}`);
  });
}

startServer();
