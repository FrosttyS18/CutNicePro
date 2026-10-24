import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  build: {
    rollupOptions: {
      output: {
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          const path = id.replaceAll("\\", "/");
          if (!path.includes("/node_modules/")) return;
          if (path.includes("/three/build/three.core.js")) return "three-core";
          if (path.includes("/three/")) return "three-renderer";
          if (path.includes("/mediabunny/")) return "video-decoder";
          if (/\/node_modules\/(?:motion|motion-dom|motion-utils|framer-motion)\//.test(path)) return "motion";
          if (/\/node_modules\/(?:@react-three|react-reconciler|its-fine)\//.test(path)) return "react-three";
          if (/\/node_modules\/(?:react|react-dom|scheduler)\//.test(path)) return "react";
        },
      },
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
}));
