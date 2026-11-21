import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { staticAssetsAdapter } from "@vinext/cloudflare/cache/static-assets-adapter";

export default defineConfig({
  // PDF export runs in the browser; jsPDF has no workerd export condition.
  resolve: {
    alias: [
      { find: /^jspdf$/, replacement: "jspdf/dist/jspdf.es.min.js" },
    ],
  },
  plugins: [
    vinext({ prerender: true, cache: { cdn: staticAssetsAdapter() } }),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
