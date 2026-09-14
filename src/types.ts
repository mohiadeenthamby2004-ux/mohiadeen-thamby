export interface DetectedNumberItem {
  id: string;
  value: number;
  rawText: string;
  label?: string;
  columnIndex?: number;
  box_2d?: [number, number, number, number] | null; // [ymin, xmin, ymax, xmax] 0-1000
}

export interface VerticalColumnLine {
  id: string;
  title: string;
  items: DetectedNumberItem[];
  sum: number;
  formula: string;
  maxDecimals: number;
  existingWrittenSum?: number | null;
}

export interface MeasurementMetadata {
  isMeasurementChart?: boolean;
  documentTitle?: string; // e.g. "MEASUREMENT LIST"
  companyName?: string; // e.g. "EVERWIN TANNERS - MELVISHARAM"
  date?: string; // e.g. "21/9/06"
  article?: string;
  supervisor?: string;
  totalPieces?: number; // e.g. 214 hides/sides
  totalSqFt?: number; // e.g. 4475.0
  averageSqFt?: number; // e.g. 20.91
  unit?: string; // "Sq. Ft."
}

export interface CalculationResult {
  success: boolean;
  // Single column backwards-compatibility
  items: DetectedNumberItem[];
  sum: number;
  formula: string;
  count: number;
  maxDecimals: number;
  
  // Multi-column / multiple vertical lines support
  columns?: VerticalColumnLine[];
  grandTotal?: number;
  grandFormula?: string;
  totalNumbersCount?: number;

  detectedTitle?: string;
  notes?: string;
  existingWrittenSum?: number | null;
  error?: string;
  source?: string;
  modelUsed?: string;
  warning?: string;

  // Full Page Measurement Chart support
  measurementMetadata?: MeasurementMetadata;
  isMeasurementChart?: boolean;
}

export interface HistoryRecord {
  id: string;
  timestamp: number;
  title: string;
  items: DetectedNumberItem[];
  sum: number;
  columns?: VerticalColumnLine[];
  grandTotal?: number;
  thumbnail?: string;
  notes?: string;
  measurementMetadata?: MeasurementMetadata;
  isMeasurementChart?: boolean;
}

