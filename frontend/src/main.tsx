import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { DueCueAuth } from "./auth";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<StrictMode><AppErrorBoundary><DueCueAuth><App /></DueCueAuth></AppErrorBoundary></StrictMode>);
