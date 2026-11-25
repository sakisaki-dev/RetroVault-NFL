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
prewarmData([
  "data/initial-data.csv",
  "data/core/extras.json",
  "private-sprites/nfl/core.json",
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
