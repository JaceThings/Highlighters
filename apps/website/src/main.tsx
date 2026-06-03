// Inter is self-hosted via @font-face in tokens.css (see the note there).
import "./styles/tokens.css";
import "./styles/global.css";

import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found in index.html");

// No StrictMode — its dev-only double-mount restarts the Stagger entrance
// mid-flight, dropping the first few items' animation visibility.
createRoot(rootEl).render(<App />);
