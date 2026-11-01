import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles/style.css";
import "./styles/theme.css";
import "./styles/hero-story.css";
import "./styles/claims.css";
import "./styles/ui-refine.css";
import "./styles/navigation-effects.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode><App /></React.StrictMode>
);
