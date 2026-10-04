import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { defineConfig } from "vitest/config";

// Grimoire only declares a module entry, which Vite's server resolver ignores.
const require = createRequire(import.meta.url);
export default defineConfig({
  test: { server: { deps: { inline: [/libram/] } } },
  resolve: {
    alias: {
      "grimoire-kolmafia": join(
        dirname(require.resolve("grimoire-kolmafia/package.json")),
        "dist/index.js",
      ),
    },
  },
});
