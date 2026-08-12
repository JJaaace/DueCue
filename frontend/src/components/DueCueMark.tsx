export type DueCueMarkVariant = "start-window" | "cue-ring" | "dc-monogram";

type MarkProps = { variant?: DueCueMarkVariant; size?: number; className?: string; title?: string };

/** Original DueCue marks: timing/start-window concepts, deliberately unrelated to any university identity. */
export function DueCueMark({ variant = "dc-monogram", size = 28, className, title = "DueCue" }: MarkProps) {
  const common = { width: size, height: size, viewBox: "0 0 48 48", fill: "none", className, role: "img", "aria-label": title };
  if (variant === "cue-ring") return <svg {...common}><title>{title}</title><path d="M34.6 9.9A16.5 16.5 0 1 0 40 24" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round"/><path d="M39.7 14.1A16.5 16.5 0 0 1 40.5 24" stroke="#d21f3c" strokeWidth="4.5" strokeLinecap="round"/><circle cx="36.3" cy="10.9" r="3.2" fill="#f7f7f7"/></svg>;
  if (variant === "dc-monogram") return <svg {...common}><title>{title}</title><path d="M10 10h12.2c8.8 0 15.8 5.3 15.8 14S31 38 22.2 38H10V10Z" stroke="currentColor" strokeWidth="4" strokeLinejoin="round"/><path d="M23 15.5a10.2 10.2 0 1 0 0 17" stroke="#d21f3c" strokeWidth="4" strokeLinecap="round"/><path d="M16 16v16" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>;
  return <svg {...common}><title>{title}</title><path d="M15 10H9v28h6M33 10h6v28h-6" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/><path d="M17 14h14M17 34h14" stroke="#777" strokeWidth="3" strokeLinecap="round"/><circle cx="24" cy="24" r="5.2" fill="#d21f3c"/><circle cx="24" cy="24" r="1.8" fill="#f7f7f7"/></svg>;
}

export function DueCueWordmark({ variant = "dc-monogram", compact = false }: { variant?: DueCueMarkVariant; compact?: boolean }) {
  return <span className="duecue-wordmark"><DueCueMark variant={variant} size={compact ? 25 : 31} /><b>DueCue</b></span>;
}
