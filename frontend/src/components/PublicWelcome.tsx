import type { ReactNode } from "react";
import { AccountActions } from "../auth";
import { AmbientNetworkBackground } from "./AmbientNetworkBackground";
import { DueCueBusyMark, DueCueWordmark } from "./DueCueMark";

export function PublicWelcome({ startDemo, actions }: { startDemo: () => void; actions?: ReactNode }) {
  return <main className="public-welcome">
    <AmbientNetworkBackground />
    <header>
      <DueCueWordmark />
      {actions ?? <AccountActions />}
    </header>
    <section className="public-welcome-hero">
      <div className="welcome-copy">
        <span>YOUR WORK. YOUR TIMING. YOUR WORKSPACE.</span>
        <h1>Know what to start before everything feels urgent.</h1>
        <p>DueCue turns your own coursework into a clear daily plan. Your classes stay private to your account—and nothing personal appears until you sign in.</p>
        <div className="welcome-actions">
          <button type="button" className="welcome-demo" onClick={startDemo}><DueCueBusyMark />Try the interactive demo</button>
          {actions ?? <AccountActions prominent />}
        </div>
        <small>No account needed for the demo. Sample coursework is temporary and completely separate from every student account.</small>
      </div>
      <div className="welcome-preview" aria-label="Preview of a personalized DueCue plan">
        <div className="preview-orbit" aria-hidden="true"><i /><i /><i /></div>
        <article>
          <header><span>TODAY’S PLAN</span><em>PRIVATE PREVIEW</em></header>
          <h2>Your next cue, explained.</h2>
          <div className="welcome-cue"><b>1</b><span><strong>Start the work that matters most</strong><small>DueCue considers your deadlines, effort, and schedule.</small></span><em>Open cue →</em></div>
          <div className="welcome-cue muted"><b>2</b><span><strong>See what is coming next</strong><small>Your real classes appear only after you connect them.</small></span><em>Private</em></div>
        </article>
      </div>
    </section>
    <footer><span>Private by design</span><span>Demo uses sample data</span><span>Every account has its own workspace</span></footer>
  </main>;
}
