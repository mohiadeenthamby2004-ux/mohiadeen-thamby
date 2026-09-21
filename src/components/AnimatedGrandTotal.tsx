import React, { useEffect, useRef, useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { formatDisplayNumber } from "../utils/math";

export interface UseCountUpOptions {
  duration?: number;
  minDecimals?: number;
  formatFn?: (val: number, decimals?: number) => string;
}

/**
 * Calculates the number of decimal places in a number (capped at 4)
 */
function getDecimalPrecision(num: number): number {
  if (!isFinite(num) || Math.floor(num) === num) return 0;
  const str = num.toString();
  const parts = str.split(".");
  return parts.length > 1 ? Math.min(parts[1].length, 4) : 0;
}

/**
 * Custom Cubic Ease-Out for natural decelerating momentum
 */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Hook for smooth counting-up animation between numerical values.
 * Gracefully handles scan completion, table value edits, and rapid successive typing.
 */
export function useCountUp(
  targetValue: number,
  options: UseCountUpOptions = {}
) {
  const [displayFormatted, setDisplayFormatted] = useState<string>(() =>
    (options.formatFn || formatDisplayNumber)(targetValue, options.minDecimals)
  );
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [animationDirection, setAnimationDirection] = useState<"up" | "down" | "none">("none");

  // Track the continuous animated number value
  const currentValueRef = useRef<number>(targetValue);
  const startValueRef = useRef<number>(targetValue);
  const targetValueRef = useRef<number>(targetValue);
  const animFrameIdRef = useRef<number | null>(null);
  const isInitialMount = useRef<boolean>(true);

  // Compute precision
  const targetPrecision = useMemo(() => {
    if (typeof options.minDecimals === "number") return options.minDecimals;
    return getDecimalPrecision(targetValue);
  }, [targetValue, options.minDecimals]);

  useEffect(() => {
    // If target value hasn't changed, nothing to animate
    if (targetValue === targetValueRef.current && !isInitialMount.current) {
      return;
    }

    // Check user preference for reduced motion
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      currentValueRef.current = targetValue;
      targetValueRef.current = targetValue;
      setDisplayFormatted(
        (options.formatFn || formatDisplayNumber)(targetValue, targetPrecision)
      );
      setIsAnimating(false);
      setAnimationDirection("none");
      isInitialMount.current = false;
      return;
    }

    // Determine start value:
    // If initial mount and target is > 0, count up from 0 to celebrate the calculation
    // Otherwise start from wherever the counter currently is
    const prevTarget = targetValueRef.current;
    const startVal = isInitialMount.current
      ? 0
      : currentValueRef.current;

    isInitialMount.current = false;
    startValueRef.current = startVal;
    targetValueRef.current = targetValue;

    const delta = targetValue - startVal;
    if (Math.abs(delta) < 0.0001) {
      currentValueRef.current = targetValue;
      setDisplayFormatted(
        (options.formatFn || formatDisplayNumber)(targetValue, targetPrecision)
      );
      setIsAnimating(false);
      setAnimationDirection("none");
      return;
    }

    setAnimationDirection(delta > 0 ? "up" : "down");
    setIsAnimating(true);

    // Dynamic duration: longer for fresh scans (large jump from 0), snappier for table cell edits
    let animDuration = options.duration;
    if (!animDuration) {
      if (startVal === 0) {
        animDuration = 900; // 900ms for full fresh scan count-up
      } else {
        animDuration = 450; // 450ms for responsive in-table updates
      }
    }

    let startTime: number | null = null;

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / animDuration, 1);
      const easedProgress = easeOutCubic(progress);

      const interpolated = startVal + delta * easedProgress;
      currentValueRef.current = interpolated;

      if (progress < 1) {
        setDisplayFormatted(
          (options.formatFn || formatDisplayNumber)(interpolated, targetPrecision)
        );
        animFrameIdRef.current = requestAnimationFrame(step);
      } else {
        // Animation complete: snap to exact final value
        currentValueRef.current = targetValue;
        setDisplayFormatted(
          (options.formatFn || formatDisplayNumber)(targetValue, targetPrecision)
        );
        setIsAnimating(false);
        setAnimationDirection("none");
        animFrameIdRef.current = null;
      }
    };

    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
    }
    animFrameIdRef.current = requestAnimationFrame(step);

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
    };
  }, [targetValue, targetPrecision, options.duration, options.formatFn]);

  return {
    displayFormatted,
    isAnimating,
    animationDirection,
    currentNumericValue: currentValueRef.current,
  };
}

export interface AnimatedGrandTotalProps {
  value: number;
  duration?: number;
  minDecimals?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
  formatFn?: (val: number, decimals?: number) => string;
  showIndicator?: boolean;
}

/**
 * Visual AnimatedGrandTotal component that renders a smoothly ticking/rolling total
 * with a subtle live calculation pulse indicator when updating.
 */
export const AnimatedGrandTotal: React.FC<AnimatedGrandTotalProps> = ({
  value,
  duration,
  minDecimals,
  className = "",
  prefix = "",
  suffix = "",
  formatFn,
  showIndicator = false,
}) => {
  const { displayFormatted, isAnimating, animationDirection } = useCountUp(value, {
    duration,
    minDecimals,
    formatFn,
  });

  return (
    <span className={`relative inline-flex items-baseline gap-1 ${className}`}>
      {prefix && <span>{prefix}</span>}
      
      <motion.span
        key={isAnimating ? "animating" : "settled"}
        initial={isAnimating ? { scale: 1.04, filter: "brightness(1.12)" } : false}
        animate={{ scale: 1, filter: "brightness(1)" }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="font-mono tracking-tight"
      >
        {displayFormatted}
      </motion.span>

      {suffix && <span>{suffix}</span>}

      {/* Optional live recalculation dot or glow indicator */}
      {showIndicator && (
        <AnimatePresence>
          {isAnimating && (
            <motion.span
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ duration: 0.2 }}
              className="inline-block w-2 h-2 rounded-full bg-emerald-400 dark:bg-emerald-300 ml-1.5 shadow-[0_0_8px_rgba(52,211,153,0.8)] self-center animate-pulse"
              title={animationDirection === "up" ? "Calculating total (+)..." : "Calculating total (-)..."}
            />
          )}
        </AnimatePresence>
      )}
    </span>
  );
};
