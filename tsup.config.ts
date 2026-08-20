import { defineConfig } from "tsup";

export default defineConfig([
  // Core: framework-agnostic client + resources. Safe to import in server
  // components, server actions, route handlers, or plain Node scripts.
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: false,
    clean: true,
    splitting: false,
    treeshake: true,
    target: "es2022",
    tsconfig: "./tsconfig.json",
    outExtension({ format }) {
      return { js: format === "cjs" ? ".cjs" : ".js" };
    },
  },
  // React hooks layer. A post-build step (see scripts/add-use-client-directive.mjs)
  // prepends "use client" so Next.js App Router treats every export as
  // client-only without consumers needing to know that. (tsup's `banner`
  // option is not used here - esbuild strips a banner that looks like a
  // module-level directive because it collides with its own "use strict"
  // insertion for CJS output.)
  {
    entry: { react: "src/react/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: false,
    clean: false,
    splitting: false,
    treeshake: true,
    target: "es2022",
    outExtension({ format }) {
      return { js: format === "cjs" ? ".cjs" : ".js" };
    },
  },
  // Server prefetch helpers. Deliberately NOT marked "use client" so server
  // components/server actions can import them for the SSR hydration pattern.
  {
    entry: { server: "src/server/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: false,
    clean: false,
    splitting: false,
    treeshake: true,
    target: "es2022",
    outExtension({ format }) {
      return { js: format === "cjs" ? ".cjs" : ".js" };
    },
  },
]);
