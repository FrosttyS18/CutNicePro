import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/poppins/latin-400.css";
import "@fontsource/poppins/latin-500.css";
import "@fontsource/poppins/latin-600.css";
import "@fontsource/poppins/latin-700.css";
import "@fontsource/poppins/latin-400-italic.css";
import "@fontsource/poppins/latin-600-italic.css";
import "@fontsource/poppins/latin-700-italic.css";
import "./tokens.css";
import "./global.css";
import "./ui.css";
import App from "./App";
import { suppressNativeContextMenu } from "./lib/context-menu";
import { installInputModality } from "./lib/input-modality";

const restoreContextMenu = suppressNativeContextMenu(document);
const restoreInputModality = installInputModality(document);
if (import.meta.hot) import.meta.hot.dispose(restoreInputModality);
if (import.meta.hot) import.meta.hot.dispose(restoreContextMenu);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
