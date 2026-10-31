import { useEffect, useRef } from "react";

type SignalLine = {
  x: number;
  y: number;
  length: number;
  angle: number;
  swayX: number;
  swayY: number;
  phase: number;
  activatedAt: number;
};

const LINE_COUNT = 14;
const SIGNAL_SPEED = 0.38;

function distanceToLine(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(px - x1, py - y1);
  const amount = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
  return Math.hypot(px - (x1 + amount * dx), py - (y1 + amount * dy));
}

export function StartupSignalNetwork({ onLogoPulse }: { onLogoPulse?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onLogoPulseRef = useRef(onLogoPulse);
  onLogoPulseRef.current = onLogoPulse;

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = motion.matches;
    let animationId = 0;
    let width = 0;
    let height = 0;
    let pointer = { x: -1_000, y: -1_000, active: false };
    let logoSignalAt = -Infinity;
    let lastLogoReaction = -Infinity;
    const lines: SignalLine[] = Array.from({ length: LINE_COUNT }, (_, index) => {
      const column = index % 4;
      const row = Math.floor(index / 4);
      return {
        x: 0.08 + column * 0.285 + Math.sin(index * 2.17) * 0.045,
        y: 0.09 + row * 0.275 + Math.cos(index * 1.73) * 0.055,
        length: 0.1 + (index % 4) * 0.022,
        angle: (-0.32 + (index % 5) * 0.16) + (row % 2 ? 0.12 : -0.08),
        swayX: 8 + (index % 3) * 4,
        swayY: 5 + (index % 4) * 2,
        phase: index * 0.83,
        activatedAt: -Infinity,
      };
    });

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
      }
    };

    const geometry = (line: SignalLine, now: number) => {
      const motionAmount = reduced ? 0 : 1;
      const centerX = line.x * width + Math.sin(now / 4_800 + line.phase) * line.swayX * motionAmount;
      const centerY = line.y * height + Math.cos(now / 5_600 + line.phase) * line.swayY * motionAmount;
      const lineLength = Math.min(260, Math.max(90, line.length * width));
      const angle = line.angle + Math.sin(now / 7_200 + line.phase) * 0.035 * motionAmount;
      const halfX = Math.cos(angle) * lineLength / 2;
      const halfY = Math.sin(angle) * lineLength / 2;
      return { centerX, centerY, x1: centerX - halfX, y1: centerY - halfY, x2: centerX + halfX, y2: centerY + halfY };
    };
    const logoCenter = () => {
      const bounds = document.querySelector<HTMLElement>(".startup-logo-stage")?.getBoundingClientRect();
      return bounds ? { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 } : { x: width * 0.5, y: height * 0.42 };
    };
    const triggerSignal = (x: number, y: number) => {
      if (reduced) return;
      const now = performance.now();
      lines.forEach((line) => {
        const point = geometry(line, now);
        line.activatedAt = now + Math.hypot(point.centerX - x, point.centerY - y) / SIGNAL_SPEED;
      });
      const logo = logoCenter();
      logoSignalAt = now + Math.hypot(logo.x - x, logo.y - y) / SIGNAL_SPEED;
    };

    const onPointerMove = (event: PointerEvent) => { pointer = { x: event.clientX, y: event.clientY, active: true }; };
    const onPointerLeave = () => { pointer.active = false; };
    const onPointerDown = (event: PointerEvent) => triggerSignal(event.clientX, event.clientY);

    const draw = (now = performance.now()) => {
      resize();
      context.clearRect(0, 0, width, height);
      const center = logoCenter();

      lines.forEach((line) => {
        const segment = geometry(line, now);
        const pointerDistance = pointer.active ? distanceToLine(pointer.x, pointer.y, segment.x1, segment.y1, segment.x2, segment.y2) : 1_000;
        const pointerGlow = Math.max(0, 1 - pointerDistance / 125);
        const signal = Math.max(0, 1 - Math.abs(now - line.activatedAt) / 620);
        const intensity = Math.max(pointerGlow, signal);
        const gradient = context.createLinearGradient(segment.x1, segment.y1, segment.x2, segment.y2);
        gradient.addColorStop(0, `rgba(185,41,62,${0.015 + intensity * 0.2})`);
        gradient.addColorStop(0.5, `rgba(246,76,102,${0.1 + intensity * 0.72})`);
        gradient.addColorStop(1, `rgba(185,41,62,${0.015 + intensity * 0.2})`);
        context.shadowBlur = intensity * 18;
        context.shadowColor = "rgba(239,55,84,.75)";
        context.strokeStyle = gradient;
        context.lineWidth = 0.75 + intensity * 1.35;
        context.beginPath();
        context.moveTo(segment.x1, segment.y1);
        context.lineTo(segment.x2, segment.y2);
        context.stroke();
        context.shadowBlur = 0;

        if (intensity > 0.12) {
          const travel = (now / 900 + line.phase) % 1;
          const x = segment.x1 + (segment.x2 - segment.x1) * travel;
          const y = segment.y1 + (segment.y2 - segment.y1) * travel;
          context.fillStyle = `rgba(255,180,191,${intensity * 0.8})`;
          context.beginPath();
          context.arc(x, y, 1.4 + intensity, 0, Math.PI * 2);
          context.fill();
        }
      });

      if (pointer.active) {
        const pointerStrength = Math.max(0, 1 - Math.hypot(pointer.x - center.x, pointer.y - center.y) / 320);
        if (pointerStrength > 0.82 && now - lastLogoReaction > 900) {
          lastLogoReaction = now;
          onLogoPulseRef.current?.();
        }
      }

      if (now >= logoSignalAt && now - logoSignalAt < 90 && now - lastLogoReaction > 500) {
        lastLogoReaction = now;
        onLogoPulseRef.current?.();
      }
      if (!reduced) animationId = requestAnimationFrame(draw);
    };

    const onMotionChange = (event: MediaQueryListEvent) => {
      reduced = event.matches;
      cancelAnimationFrame(animationId);
      draw();
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    const onResize = () => { resize(); if (reduced) draw(); };
    window.addEventListener("resize", onResize);
    motion.addEventListener("change", onMotionChange);
    draw();
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onResize);
      motion.removeEventListener("change", onMotionChange);
    };
  }, []);

  return <canvas ref={canvasRef} className="startup-signal-network" aria-hidden="true" />;
}
