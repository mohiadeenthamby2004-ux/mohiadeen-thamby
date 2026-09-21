import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function buildStandaloneHtml() {
  const outDir = path.join(rootDir, 'dist-standalone');
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }

  console.log('Building standalone offline single-file HTML app...');
  await build({
    configFile: false,
    root: rootDir,
    plugins: [
      react(),
      tailwindcss(),
      viteSingleFile({
        removeViteModuleLoader: true,
      }),
    ],
    resolve: {
      alias: {
        '@': rootDir,
      },
    },
    build: {
      outDir,
      emptyOutDir: true,
      cssCodeSplit: false,
      assetsInlineLimit: 100000000, // 100MB to inline all assets
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
        },
      },
    },
  });

  const htmlPath = path.join(outDir, 'index.html');
  if (!fs.existsSync(htmlPath)) {
    throw new Error('Failed to generate standalone index.html');
  }

  const htmlContent = fs.readFileSync(htmlPath, 'utf8');
  console.log(`Successfully generated standalone index.html (${htmlContent.length} bytes)`);
  return htmlPath;
}

buildStandaloneHtml().catch((err) => {
  console.error('Error building standalone HTML:', err);
  process.exit(1);
});
