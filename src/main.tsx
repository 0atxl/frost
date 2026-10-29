import React from "react";
import ReactDOM from "react-dom/client";
import { AppLock } from "./components/app-lock";
import "@fontsource-variable/inter";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppLock />
  </React.StrictMode>,
);
