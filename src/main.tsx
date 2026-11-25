import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import CrashScreen from "./components/CrashScreen";
import "./index.css";
import { installPressFeedback } from "./utils/motion";
import { initPinScroll } from "./utils/pinScroll";
import { installNflStorage, IS_NFL } from "./config/edition";
import { prewarmData } from "./utils/dataStore";

// The NFL edition keeps its browser storage under its own prefix (before anything reads it)
installNflStorage();

// The NFL edition swaps the Silkscreen pixel font for the site's display type (src/nflFont.css)
if (IS_NFL) {
  document.documentElement.classList.add("nfl-ed");
  import("./nflFont.css");
}

// The league sheet and the core extras start downloading now, not when the first tab has rendered (dataStore.ts)
// The Collection prices cards from the small latest-prices file: when it is the open tab, that own file starts now too.
const hash = window.location.hash;
prewarmData([
  "data/initial-data.csv",
  "data/core/extras.json",
  "private-sprites/nfl/core.json",
  // what every tab's ratings, search and cards read once it mounts (the lazy hosts used to ask for these at boot)
  "data/sprites.json",
  "data/legends.json",
  "data/game-exclusions.json",
  "data/league/season_ovr.json",
  "data/nfl/career_rating.json",
  "data/league/content.json",
  ...(/^#\/?collection/.test(hash) ? ["data/market-latest.json"] : []),
]);

// Tap feedback for every button, chip, row and card (src/utils/motion.ts)
installPressFeedback();
// Pinned table columns get their edge shadow once the table has scrolled sideways
initPinScroll();

// A render error shows what broke (and a reload button) instead of a blank page
createRoot(document.getElementById("root")!).render(
  <CrashScreen>
    <App />
  </CrashScreen>,
);
