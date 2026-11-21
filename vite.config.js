import { defineConfig } from "vite";

// Same policy as electron/main.js (CSP_PROD). It is sent as a response header by the app://
// protocol AND embedded as <meta> in the production index.html (defense in depth).
const CSP_PROD = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'"
].join("; ");

const cspMeta = {
  name: "eqo-partitura-csp-meta",
  apply: "build",
  transformIndexHtml() {
    return [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CSP_PROD }, injectTo: "head-prepend" }];
  }
};

export default defineConfig({
  base: "./",
  publicDir: false,
  clearScreen: false,
  plugins: [cspMeta],
  server: {
    port: 5173,
    strictPort: true,
    host: "localhost"
  },
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        splash: "splash.html"
      }
    },
    outDir: "dist",
    emptyOutDir: true,
    target: "esnext",
    assetsInlineLimit: 0, // keep fonts / icons as separate files (CSP-friendly, cacheable)
    chunkSizeWarningLimit: 4000
  }
});
