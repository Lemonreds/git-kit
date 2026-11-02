import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { applyDocumentLang } from "./i18n";
import { applyTheme, readTheme } from "./lib/theme";
import "./styles/index.css";

// Before the first paint: a stored dark theme must not flash a white window, and
// `<html lang>` has to match the stored locale for screen readers.
applyTheme(readTheme());
applyDocumentLang();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);