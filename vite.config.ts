import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      // "prompt": a new build installs but waits; the app surfaces an UPDATE
      // button (see App.tsx) instead of silently reloading — never interrupts
      // playback mid-song.
      registerType: "prompt",
      includeAssets: ["apple-touch-icon-180x180.png"],
      manifest: {
        name: "M3disp",
        short_name: "M3disp",
        description: "A realtime MSX sound player for the Web.",
        lang: "en",
        start_url: "./",
        scope: "./",
        display: "standalone",
        background_color: "#0e1116",
        theme_color: "#0e1116",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wav}']
      },
    }),
  ],
})
