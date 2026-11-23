import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import CrashScreen from "./components/CrashScreen";
import "./index.css";
import { installPressFeedback } from "./utils/motion";
import { installNflStorage } from "./config/edition";

// The NFL edition keeps its browser storage under its own prefix (before anything reads it)
installNflStorage();

// Tap feedback for every button, chip, row and card (src/utils/motion.ts)
installPressFeedback();

// A render error shows what broke (and a reload button) instead of a blank page
createRoot(document.getElementById("root")!).render(
  <CrashScreen>
    <App />
  </CrashScreen>,
);
