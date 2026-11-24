import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary";

// Tells the static skeleton in index.html that React took over, so its "did not start"
// fallback stays quiet.
(window as Window & { __sahayogiMounted?: boolean }).__sahayogiMounted = true;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
