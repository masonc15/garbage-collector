import { readFileSync } from "node:fs";
import esbuild, { Plugin } from "esbuild";

// @ts-expect-error No types for this module
const { default: babel } = (await import("esbuild-plugin-babel")) as {
  default: () => Plugin;
};

const version = JSON.parse(readFileSync("package.json", "utf8")).version;

const watch = process.argv.some((arg) => ["--watch", "-w"].includes(arg));

const context = await esbuild.context({
  bundle: true,
  platform: "node",
  target: "rhino1.8.0",
  external: ["kolmafia"],
  define: {
    "process.env.GITHUB_SHA": `"${
      process.env?.["GITHUB_SHA"] ?? "CustomBuild"
    }"`,
    "process.env.GITHUB_REF_NAME": `"${
      process.env?.["GITHUB_REF_NAME"] ?? `nightcap-${version}`
    }"`,
    "process.env.GITHUB_REPOSITORY": `"${
      process.env?.["GITHUB_REPOSITORY"] ?? "CustomBuild"
    }"`,
  },
  entryPoints: {
    "scripts/garbo-nightcap/garbo-nightcap": "src/index.ts",
    "relay/relay_garbo_nightcap": "src/relay_garbo.ts",
    "scripts/garbo-nightcap/garbo-nightcap-price": "src/price_garbo.ts",
  },
  entryNames: "[dir]/[name]",
  outdir: "dist",
  plugins: [babel()],
});

await context.rebuild();

if (watch) {
  await context.watch();
} else {
  context.dispose();
}
