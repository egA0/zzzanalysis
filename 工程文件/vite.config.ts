import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  build: {
    outDir: "../成品",
    emptyOutDir: true,
  },
  server: {
    allowedHosts: ["frp-few.com"],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "抽卡规划台",
        short_name: "规划台",
        description: "本地优先的抽卡资源与概率规划",
        theme_color: "#111111",
        background_color: "#111111",
        lang: "zh-CN",
        display: "standalone",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "maskable",
          },
        ],
      },
      workbox: { globPatterns: ["**/*.{js,css,html,svg}"] },
    }),
  ],
});
