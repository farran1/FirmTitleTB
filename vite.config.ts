import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => {
  const isDev = mode === "development";

  return {
    // → "/" in dev so localhost works,
    // → "/FirmTitleTB/" in prod so GH Pages assets load
    base: "/",

    // Enable source-maps in prod for real stack traces
    build: {
      sourcemap: true,
    },

    server: {
      host: "::",
      port: 8080,
    },

    plugins: [
      react(),
      isDev && componentTagger(),
    ].filter(Boolean),

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
