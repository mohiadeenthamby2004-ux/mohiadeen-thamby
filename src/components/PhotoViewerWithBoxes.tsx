import React, { useRef, useState, useEffect, useCallback } from "react";
import { DetectedNumberItem, VerticalColumnLine } from "../types";
import {
  Eye,
  EyeOff,
  RotateCcw,
  Tag,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Move,
  RotateCw,
} from "lucide-react";

interface PhotoViewerWithBoxesProps {
  imageSrc: string;
  items: DetectedNumberItem[];
  columns?: VerticalColumnLine[];
  hoveredItemId: string | null;
  onHoverItem: (id: string | null) => void;
  onRetake: () => void;
}

const COLUMN_COLORS = [
  { border: "border-blue-500", bg: "bg-blue-500/20", badge: "bg-blue-600 text-white" },
  { border: "border-indigo-500", bg: "bg-indigo-500/20", badge: "bg-indigo-600 text-white" },
  { border: "border-teal-500", bg: "bg-teal-500/20", badge: "bg-teal-600 text-white" },
  { border: "border-purple-500", bg: "bg-purple-500/20", badge: "bg-purple-600 text-white" },
];

const MIN_ZOOM = 1;
const MAX_ZOOM = 4.5;
const ZOOM_STEP = 0.4;

export const PhotoViewerWithBoxes: React.FC<PhotoViewerWithBoxesProps> = ({
  imageSrc,
  items,
  columns,
  hoveredItemId,
  onHoverItem,
  onRetake,
}) => {
  const [showBoxes, setShowBoxes] = useState<boolean>(true);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchStartDistRef = useRef<number | null>(null);
  const initialTouchZoomRef = useRef<number>(1);

  const displayItems = columns && columns.length > 0 ? columns.flatMap((c) => c.items) : items;
  const hasBoxes = displayItems.some((it) => it.box_2d && it.box_2d.length === 4);

  // Clamp pan based on current zoom so image remains within view
  const clampPan = useCallback((x: number, y: number, currentZoom: number) => {
    if (currentZoom <= 1) return { x: 0, y: 0 };
    if (!containerRef.current) return { x, y };

    const rect = containerRef.current.getBoundingClientRect();
    const maxX = (rect.width * (currentZoom - 1)) / 2;
    const maxY = (rect.height * (currentZoom - 1)) / 2;

    return {
      x: Math.min(Math.max(x, -maxX), maxX),
      y: Math.min(Math.max(y, -maxY), maxY),
    };
  }, []);

  const handleZoomIn = () => {
    setZoom((prev) => {
      const next = Math.min(prev + ZOOM_STEP, MAX_ZOOM);
      setPan((p) => clampPan(p.x, p.y, next));
      return Number(next.toFixed(2));
    });
  };

  const handleZoomOut = () => {
    setZoom((prev) => {
      const next = Math.max(prev - ZOOM_STEP, MIN_ZOOM);
      if (next === 1) {
        setPan({ x: 0, y: 0 });
      } else {
        setPan((p) => clampPan(p.x, p.y, next));
      }
      return Number(next.toFixed(2));
    });
  };

  const handleResetZoomAndPan = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Double-click to toggle between 1x and 2.2x
  const handleDoubleClick = (e: React.MouseEvent) => {
    if (zoom > 1.2) {
      handleResetZoomAndPan();
    } else {
      const nextZoom = 2.2;
      setZoom(nextZoom);
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const offsetX = e.clientX - (rect.left + rect.width / 2);
        const offsetY = e.clientY - (rect.top + rect.height / 2);
        // Pan towards where the user double-clicked
        const targetPan = clampPan(-offsetX * 0.8, -offsetY * 0.8, nextZoom);
        setPan(targetPan);
      }
    }
  };

  // Mouse drag handling
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only primary mouse button and when zoomed in (or allow holding space)
    if (e.button !== 0 || zoom <= 1) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...pan };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || zoom <= 1) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    const rawX = panStartRef.current.x + dx;
    const rawY = panStartRef.current.y + dy;
    setPan(clampPan(rawX, rawY, zoom));
  };

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
    }
  };

  // Touch drag and pinch-to-zoom
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && zoom > 1) {
      setIsDragging(true);
      dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      panStartRef.current = { ...pan };
    } else if (e.touches.length === 2) {
      // 2-finger pinch
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchStartDistRef.current = Math.hypot(dx, dy);
      initialTouchZoomRef.current = zoom;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging && zoom > 1) {
      const dx = e.touches[0].clientX - dragStartRef.current.x;
      const dy = e.touches[0].clientY - dragStartRef.current.y;
      setPan(clampPan(panStartRef.current.x + dx, panStartRef.current.y + dy, zoom));
    } else if (e.touches.length === 2 && touchStartDistRef.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / touchStartDistRef.current;
      const nextZoom = Math.min(
        Math.max(initialTouchZoomRef.current * ratio, MIN_ZOOM),
        MAX_ZOOM
      );
      setZoom(Number(nextZoom.toFixed(2)));
      setPan((p) => clampPan(p.x, p.y, nextZoom));
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    touchStartDistRef.current = null;
  };

  // Wheel zoom listener (non-passive to prevent full-page scroll)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      setZoom((prev) => {
        const next = Math.min(Math.max(prev * zoomFactor, MIN_ZOOM), MAX_ZOOM);
        const rounded = Number(next.toFixed(2));
        if (rounded <= 1) {
          setPan({ x: 0, y: 0 });
        } else {
          setPan((p) => clampPan(p.x, p.y, rounded));
        }
        return rounded;
      });
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
    };
  }, [clampPan]);

  const isTransformed = zoom > 1 || pan.x !== 0 || pan.y !== 0;

  return (
    <div className="w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
      {/* Header */}
      <div className="p-3.5 sm:p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600 dark:bg-blue-400" />
          <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Scanned Photo</h4>
          {hasBoxes && (
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
              OCR Highlights
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {/* Zoom In/Out & Reset toolbar */}
          <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 p-0.5">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoom <= MIN_ZOOM}
              className="p-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 disabled:opacity-35 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-not-allowed"
              title="Zoom out"
              aria-label="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleResetZoomAndPan}
              className="px-2 py-1 text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
              title="Click to reset zoom to 100%"
            >
              {Math.round(zoom * 100)}%
            </button>

            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoom >= MAX_ZOOM}
              className="p-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 disabled:opacity-35 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-not-allowed"
              title="Zoom in"
              aria-label="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>

            {isTransformed && (
              <button
                type="button"
                onClick={handleResetZoomAndPan}
                className="p-1.5 ml-0.5 rounded-md text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 transition-colors cursor-pointer"
                title="Reset zoom & pan"
                aria-label="Reset zoom and pan"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {hasBoxes && (
            <button
              type="button"
              onClick={() => setShowBoxes(!showBoxes)}
              className="p-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              title={showBoxes ? "Hide Detection Boxes" : "Show Detection Boxes"}
            >
              {showBoxes ? (
                <Eye className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span className="text-xs hidden sm:inline">{showBoxes ? "Boxes On" : "Boxes Off"}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onRetake}
            className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Retake / New</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>
      </div>

      {/* Image, Zoom/Pan stage and bounding boxes */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={handleDoubleClick}
        className={`relative w-full bg-slate-950 flex items-center justify-center overflow-hidden min-h-[300px] max-h-[520px] select-none ${
          zoom > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-default"
        }`}
      >
        {/* Zoom & Pan Animated Wrapper */}
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            transition: isDragging ? "none" : "transform 150ms cubic-bezier(0.2, 0, 0, 1)",
          }}
          className="relative inline-flex items-center justify-center max-w-full"
        >
          <img
            src={imageSrc}
            alt="Captured numbers"
            draggable={false}
            className="w-full h-auto max-h-[520px] object-contain select-none pointer-events-none block"
          />

          {/* Overlay Bounding Boxes (Scale & Pan synchronously) */}
          {showBoxes &&
            displayItems.map((item) => {
              if (!item.box_2d || item.box_2d.length !== 4) return null;
              const [ymin, xmin, ymax, xmax] = item.box_2d;
              const isHovered = hoveredItemId === item.id;
              const colIdx = typeof item.columnIndex === "number" ? item.columnIndex : 0;
              const colorScheme = COLUMN_COLORS[colIdx % COLUMN_COLORS.length];

              // Coordinates on a 0-1000 scale
              const topPct = (ymin / 1000) * 100;
              const leftPct = (xmin / 1000) * 100;
              const widthPct = ((xmax - xmin) / 1000) * 100;
              const heightPct = ((ymax - ymin) / 1000) * 100;

              return (
                <div
                  key={item.id}
                  onMouseEnter={() => onHoverItem(item.id)}
                  onMouseLeave={() => onHoverItem(null)}
                  style={{
                    top: `${topPct}%`,
                    left: `${leftPct}%`,
                    width: `${Math.max(widthPct, 3)}%`,
                    height: `${Math.max(heightPct, 3)}%`,
                  }}
                  className={`absolute transition-all rounded-sm cursor-pointer z-10 ${
                    isHovered
                      ? "border-2 border-amber-400 bg-amber-400/30 shadow-lg ring-2 ring-amber-300/60"
                      : `border-2 ${colorScheme.border} ${colorScheme.bg} hover:border-amber-400 hover:bg-amber-400/25`
                  }`}
                >
                  {/* Floating pill badge */}
                  <div
                    className={`absolute -top-6 left-0 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shadow-xs whitespace-nowrap pointer-events-none transition-colors ${
                      isHovered
                        ? "bg-amber-500 text-slate-950"
                        : colorScheme.badge
                    }`}
                  >
                    {item.value}
                  </div>
                </div>
              );
            })}
        </div>

        {/* Floating Pan/Zoom Indicators & Quick Overlay Controls */}
        <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 bg-slate-900/80 backdrop-blur-md border border-slate-700/80 text-white rounded-xl p-1 shadow-md text-xs">
          {zoom > 1 ? (
            <div className="flex items-center gap-1 px-2 text-[11px] text-slate-300">
              <Move className="w-3 h-3 text-blue-400" />
              <span>Drag to pan</span>
            </div>
          ) : (
            <span className="px-2 text-[11px] text-slate-400">Scroll / Double-click to zoom</span>
          )}

          <div className="h-4 w-px bg-slate-700" />

          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoom <= MIN_ZOOM}
            className="p-1 rounded text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
            title="Zoom out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-[11px] font-semibold px-1 min-w-[36px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoom >= MAX_ZOOM}
            className="p-1 rounded text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
            title="Zoom in"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          {isTransformed && (
            <button
              type="button"
              onClick={handleResetZoomAndPan}
              className="p-1 rounded text-blue-400 hover:text-blue-300 hover:bg-slate-800 cursor-pointer"
              title="Reset view (100%)"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Footer hint */}
      <div className="p-3 bg-slate-50 dark:bg-slate-900/90 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Tag className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
          <span>
            {hasBoxes
              ? "Hover any box on the photo or table to cross-reference numbers."
              : "Photo scanned and verified."}
          </span>
        </div>

        <div className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
          <span>Tip: Double-click to toggle zoom • Mouse wheel or pinch to inspect numbers</span>
        </div>
      </div>
    </div>
  );
};

