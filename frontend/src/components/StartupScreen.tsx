import { DueCueWordmark } from "./DueCueMark";

export function StartupScreen({ longWait = false }: { longWait?: boolean }) {
  return <main className="startup-screen" role="status" aria-live="polite" aria-label="DueCue is loading">
    <div className="startup-glow" aria-hidden="true" />
    <section>
      <DueCueWordmark compact />
      <div className="startup-pulse" aria-hidden="true"><i /><i /><i /></div>
      <h1>Preparing your academic workspace…</h1>
      <p>{longWait ? "The demo server is waking up. This may take a moment." : "Finding your next cue and getting your plan ready."}</p>
    </section>
  </main>;
}

export function StartupRecovery({ message, retry }: { message: string; retry: () => void }) {
  return <main className="startup-screen recovery-screen">
    <section role="alert">
      <DueCueWordmark compact />
      <span>WE COULDN’T FINISH STARTING</span>
      <h1>DueCue needs another moment</h1>
      <p>{message}</p>
      <button type="button" onClick={retry}>Try again</button>
    </section>
  </main>;
}
