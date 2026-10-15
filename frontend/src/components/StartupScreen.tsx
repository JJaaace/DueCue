import { useEffect, useState } from "react";
import { DueCueBusyMark } from "./DueCueMark";
import { StartupSignalNetwork } from "./StartupSignalNetwork";

const AUTOMATIC_RETRY_SECONDS = 10;

export function StartupScreen({ longWait = false }: { longWait?: boolean }) {
  const [logoPulse, setLogoPulse] = useState(0);
  return <main className="startup-screen" role="status" aria-live="polite" aria-label="DueCue is loading">
    <StartupSignalNetwork onLogoPulse={() => setLogoPulse((current) => current + 1)} />
    <div className="startup-glow" aria-hidden="true" />
    <section>
      <div key={logoPulse} className={`startup-logo-stage ${logoPulse ? "signal-hit" : ""}`} aria-label="DueCue">
        <DueCueBusyMark />
        <b>DueCue</b>
        <i aria-hidden="true" />
      </div>
      <div className="startup-pulse" aria-hidden="true"><i /><i /><i /></div>
      <h1>Preparing your academic workspace…</h1>
      <p>{longWait ? "The workspace service is waking up. DueCue will open automatically as soon as it’s ready." : "Finding your next cue and getting your plan ready."}</p>
    </section>
  </main>;
}

export function StartupRecovery({ message, retry, autoRetry = true }: { message: string; retry: () => void; autoRetry?: boolean }) {
  const [seconds, setSeconds] = useState(AUTOMATIC_RETRY_SECONDS);
  const [logoPulse, setLogoPulse] = useState(0);

  useEffect(() => {
    if (!autoRetry) return;
    const countdown = window.setInterval(() => setSeconds((current) => Math.max(0, current - 1)), 1_000);
    const reconnect = window.setTimeout(retry, AUTOMATIC_RETRY_SECONDS * 1_000);
    return () => { window.clearInterval(countdown); window.clearTimeout(reconnect); };
  }, [autoRetry, retry]);

  return <main className="startup-screen recovery-screen">
    <StartupSignalNetwork onLogoPulse={() => setLogoPulse((current) => current + 1)} />
    <section role="alert">
      <div key={logoPulse} className={`startup-logo-stage ${logoPulse ? "signal-hit" : ""}`} aria-label="DueCue">
        <DueCueBusyMark />
        <b>DueCue</b>
        <i aria-hidden="true" />
      </div>
      <span>STILL WAKING UP</span>
      <h1>DueCue is reconnecting</h1>
      <p>{message}</p>
      {autoRetry && <small aria-live="polite">Trying again automatically in {seconds} seconds.</small>}
      <button type="button" onClick={retry}>Retry now</button>
    </section>
  </main>;
}
