import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  // PDF export runs in the browser; jsPDF has no workerd export condition.
  resolve: {
    alias: [
      { find: /^jspdf$/, replacement: "jspdf/dist/jspdf.es.min.js" },
    ],
  },
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
