import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    outDir: "dist/relay",
    rollupOptions: {
      output: {
        entryFileNames: "garbo-nightcap/[name].js",
        chunkFileNames: "garbo-nightcap/[name].js",
        assetFileNames: "garbo-nightcap/[name].[ext]",
      },
    },
    assetsInlineLimit: 100000,
  },
  plugins: [react()],
});
