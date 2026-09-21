/**
 * Client-Side Image Optimizer for Fast Upload and High-Quality OCR
 * Downscales camera and gallery images so payloads are ~200-400KB instead of 10MB+.
 * This prevents timeouts, avoids upload errors, and keeps number recognition fast.
 */

export interface OptimizeImageOptions {
  maxDimension?: number;
  quality?: number;
}

export function optimizeImageForOcr(
  dataUrlOrFile: string | File | Blob,
  options: OptimizeImageOptions = {}
): Promise<string> {
  const maxDimension = options.maxDimension || 1600;
  const quality = options.quality || 0.9;

  return new Promise((resolve, reject) => {
    // Helper to process an HTMLImageElement on canvas
    const processImageElement = (img: HTMLImageElement) => {
      try {
        let { width, height } = img;
        if (width === 0 || height === 0) {
          if (typeof dataUrlOrFile === "string") {
            resolve(dataUrlOrFile);
          } else {
            reject(new Error("Image has zero dimensions"));
          }
          return;
        }

        // Calculate scaled dimensions
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        if (!ctx) {
          if (typeof dataUrlOrFile === "string") {
            resolve(dataUrlOrFile);
          } else {
            reject(new Error("Canvas context could not be created"));
          }
          return;
        }

        // Enable high-quality image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        // Draw image onto canvas
        ctx.drawImage(img, 0, 0, width, height);

        // Export as clean, high-clarity JPEG
        const optimizedDataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(optimizedDataUrl);
      } catch (err) {
        console.warn("Image optimization warning, using original:", err);
        if (typeof dataUrlOrFile === "string") {
          resolve(dataUrlOrFile);
        } else {
          reject(err);
        }
      }
    };

    if (typeof dataUrlOrFile === "string") {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => processImageElement(img);
      img.onerror = () => resolve(dataUrlOrFile); // Fallback to raw string
      img.src = dataUrlOrFile;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (!result) {
          reject(new Error("Could not read image file"));
          return;
        }
        const img = new Image();
        img.onload = () => processImageElement(img);
        img.onerror = () => resolve(result);
        img.src = result;
      };
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(dataUrlOrFile);
    }
  });
}
