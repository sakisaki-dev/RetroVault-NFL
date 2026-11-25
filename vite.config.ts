import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";

// Retro Bowl's own sprites (scripts/private_nfl_sprites.py, scripts/private_sprites.py) in public/private-sprites/,
// committed and deployed by the owner's choice (2026-11-14). The site fetches them whenever the folder is there, the
// Pages build included; a checkout without it builds the classic art.
const PRIVATE_SPRITES = fs.existsSync(path.resolve(__dirname, "public/private-sprites"));

// NFL edition (local demo): ESPN's article API (content.core.api.espn.com) is read through this proxy in dev and preview
const ESPN_PROXY =
  process.env.VITE_EDITION === "nfl"
    ? { "/espn-content": { target: "https://content.core.api.espn.com", changeOrigin: true, rewrite: (p: string) => p.replace(/^\/espn-content/, "") } }
    : undefined;

// NFL edition icons (scripts/nfl/build_nfl_icons.py → public/nfl-icons/, "Kickoff, night game"): the NFL build links them in
// place of the Retro Bowl edition's Kickoff icons in public/, which it leaves alone; the Retro Bowl build drops the folder.
const NFL_ICONS_VERSION = "nightgame";
const nflIcons = (): Plugin => ({
  name: "nfl-icons",
  transformIndexHtml: {
    order: "pre",
    handler(html) {
      return html
        .replace(/%BASE_URL%(favicon\.ico|favicon-32\.png|apple-touch-icon\.png)\?v=kickoff/g, `%BASE_URL%nfl-icons/$1?v=${NFL_ICONS_VERSION}`)
        .replace("%BASE_URL%manifest.webmanifest", `%BASE_URL%nfl-icons/manifest.webmanifest?v=${NFL_ICONS_VERSION}`)
        .replace(/%BASE_URL%splash\//g, "%BASE_URL%nfl-icons/splash/")
        .replace(/(apple-mobile-web-app-title|application-name)" content="Retro Vault"/g, '$1" content="RV NFL"');
    },
  },
});

// The data store (src/utils/dataStore.ts) can only name a file's `?v=` URL once it has public/data/manifest.json, and
// it used to ask for the manifest only after the JS had booted and a tab chunk wanted data, behind the tab's chunk
// requests. index.html now starts the (10 KB) manifest request first thing, and the entry module prewarms the league
// sheet and the core extras the moment it runs (main.tsx, prewarmData). A page that does not ship the manifest is
// untouched. (Preloading the data files from the HTML itself was measured and is slower: they share the line with the
// JS and CSS and delay first paint.)
const earlyManifest = (): Plugin => {
  let base = "/";
  return {
    name: "early-manifest",
    apply: "build",
    configResolved(config) {
      base = config.base.endsWith("/") ? config.base : `${config.base}/`;
    },
    transformIndexHtml() {
      return [
        {
          tag: "script",
          children: `window.__rvManifest=fetch(${JSON.stringify(`${base}data/manifest.json`)},{cache:"no-cache"}).then(function(r){return r.ok?r.json():null}).catch(function(){return null});`,
          injectTo: "head-prepend" as const,
        },
      ];
    },
  };
};

// https://vitejs.dev/config/
export default defineConfig(() => ({
  // GitHub Pages serves the site from /RetroVault/; the deploy workflow sets BASE_PATH. Local dev stays at /.
  base: process.env.BASE_PATH || "/",
  // The perf harness builds against a scratch copy of public/ (scripts/perf/synth.py: a synthetic 10,000-player roster)
  publicDir: process.env.RV_PUBLIC_DIR || "public",
  define: { __PRIVATE_SPRITES__: JSON.stringify(PRIVATE_SPRITES) },
  // Source maps beside the bundles (not linked from them), so a crash screen's minified stack can be mapped back
  build: { sourcemap: "hidden" },
  server: {
    host: "::",
    port: 8080,
    proxy: ESPN_PROXY,
  },
  preview: { proxy: ESPN_PROXY },
  plugins: [
    react(),
    earlyManifest(),
    process.env.VITE_EDITION === "nfl" && nflIcons(),
    process.env.VITE_EDITION !== "nfl" &&
      ((): Plugin => {
        let outDir = "dist";
        return {
          name: "drop-nfl-icons",
          apply: "build",
          configResolved(config) {
            outDir = path.resolve(config.root, config.build.outDir);
          },
          closeBundle() {
            fs.rmSync(path.join(outDir, "nfl-icons"), { recursive: true, force: true });
          },
        };
      })(),
    // Belt and braces: a build that isn't showing the private sprites never ships a copy of them either
    !PRIVATE_SPRITES &&
      ((): Plugin => {
        let outDir = "dist";
        return {
          name: "drop-private-sprites",
          apply: "build",
          configResolved(config) {
            outDir = path.resolve(config.root, config.build.outDir);
          },
          closeBundle() {
            fs.rmSync(path.join(outDir, "private-sprites"), { recursive: true, force: true });
          },
        };
      })(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
