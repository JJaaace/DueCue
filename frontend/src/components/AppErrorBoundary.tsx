import { Component, type ErrorInfo, type ReactNode } from "react";
import { StartupRecovery } from "./StartupScreen";

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error("DueCue application error", error, info);
  }

  render() {
    if (this.state.failed) return <StartupRecovery message="Something unexpected interrupted the workspace. Reloading will safely try again." retry={() => window.location.reload()} />;
    return this.props.children;
  }
}
