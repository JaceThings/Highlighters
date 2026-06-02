// Inter is self-hosted (official rsms v4.1) via an @font-face in tokens.css —
// see the note there for why the Google Fonts build won't do.
import "./styles/tokens.css";
import "./styles/global.css";

import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found in index.html");

// No StrictMode — its dev-only double-mount makes the Stagger entrance
// restart mid-flight (class added → cleanup → class re-added), which
// drops the first few items' animation visibility. Production behaviour
// is identical either way.
createRoot(rootEl).render(<App />);
