// @ts-check
import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import react from "@astrojs/react";

// https://astro.build/config
export default defineConfig({
  site: "https://viktorzouboulis.com",
  integrations: [
    tailwind({
      applyBaseStyles: false,
    }),
    react(),
  ],
  vite: {
    // Keep graph/map deps prebundled so client islands don't 504 while Vite
    // discovers them after the initial optimizeDeps scan.
    optimizeDeps: {
      include: ["d3-force", "d3-geo", "topojson-client"],
    },
  },
});
