import { useEffect, useRef } from "react";

type SignalNode = {
  x: number;
  y: number;
  driftX: number;
  driftY: number;
  phase: number;
  activatedAt: number;
};

const NODE_COUNT = 30;
const SIGNAL_SPEED = 0.38;

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
    const nodes: SignalNode[] = Array.from({ length: NODE_COUNT }, (_, index) => {
      const angle = index * 2.399963;
      const radius = 0.15 + (index % 8) * 0.052;
      return {
        x: 0.5 + Math.cos(angle) * radius,
        y: 0.48 + Math.sin(angle) * radius * 0.78,
        driftX: Math.sin(index * 1.7) * 0.000025,
        driftY: Math.cos(index * 1.31) * 0.000022,
        phase: index * 0.73,
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

    const position = (node: SignalNode) => ({ x: node.x * width, y: node.y * height });
    const logoCenter = () => {
      const bounds = document.querySelector<HTMLElement>(".startup-logo-stage")?.getBoundingClientRect();
      return bounds ? { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 } : { x: width * 0.5, y: height * 0.42 };
    };
    const triggerSignal = (x: number, y: number) => {
      if (reduced) return;
      const now = performance.now();
      nodes.forEach((node) => {
        const point = position(node);
        node.activatedAt = now + Math.hypot(point.x - x, point.y - y) / SIGNAL_SPEED;
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
      const connectionRange = Math.min(260, Math.max(150, width * 0.15));

      if (!reduced) nodes.forEach((node) => {
        node.x += node.driftX;
        node.y += node.driftY;
        if (node.x < 0.04 || node.x > 0.96) node.driftX *= -1;
        if (node.y < 0.05 || node.y > 0.93) node.driftY *= -1;
      });

      nodes.forEach((node, index) => {
        const a = position(node);
        nodes.slice(index + 1).forEach((other) => {
          const b = position(other);
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          if (distance > connectionRange) return;
          const pointerDistance = pointer.active ? Math.min(Math.hypot(a.x - pointer.x, a.y - pointer.y), Math.hypot(b.x - pointer.x, b.y - pointer.y)) : 1_000;
          const pointerGlow = Math.max(0, 1 - pointerDistance / 190);
          const activeA = Math.max(0, 1 - Math.abs(now - node.activatedAt) / 520);
          const activeB = Math.max(0, 1 - Math.abs(now - other.activatedAt) / 520);
          const signal = Math.max(activeA, activeB, pointerGlow * 0.62);
          const gradient = context.createLinearGradient(a.x, a.y, b.x, b.y);
          gradient.addColorStop(0, `rgba(238,64,91,${0.09 + signal * 0.68})`);
          gradient.addColorStop(0.5, `rgba(255,136,153,${0.04 + signal * 0.48})`);
          gradient.addColorStop(1, `rgba(160,38,57,${0.08 + signal * 0.58})`);
          context.strokeStyle = gradient;
          context.lineWidth = 0.7 + signal * 1.45;
          context.beginPath();
          context.moveTo(a.x, a.y);
          context.lineTo(b.x, b.y);
          context.stroke();
        });
      });

      nodes.forEach((node) => {
        const point = position(node);
        const pointerGlow = pointer.active ? Math.max(0, 1 - Math.hypot(point.x - pointer.x, point.y - pointer.y) / 155) : 0;
        const signal = Math.max(0, 1 - Math.abs(now - node.activatedAt) / 560);
        const idle = 0.18 + Math.sin(now / 900 + node.phase) * 0.06;
        const intensity = Math.max(idle, pointerGlow, signal);
        if (signal > 0.04) {
          context.strokeStyle = `rgba(241,68,96,${signal * 0.45})`;
          context.lineWidth = 1;
          context.beginPath();
          context.arc(point.x, point.y, 5 + (1 - signal) * 24, 0, Math.PI * 2);
          context.stroke();
        }
        context.shadowBlur = intensity * 20;
        context.shadowColor = "rgba(239,55,84,.9)";
        context.fillStyle = `rgba(241,80,105,${0.26 + intensity * 0.7})`;
        context.beginPath();
        context.arc(point.x, point.y, 1.7 + intensity * 2.2, 0, Math.PI * 2);
        context.fill();
        context.shadowBlur = 0;
      });

      if (pointer.active) {
        const pointerStrength = Math.max(0, 1 - Math.hypot(pointer.x - center.x, pointer.y - center.y) / 320);
        context.strokeStyle = `rgba(239,67,94,${0.06 + pointerStrength * 0.16})`;
        context.lineWidth = 1;
        context.beginPath();
        context.arc(pointer.x, pointer.y, 32 + pointerStrength * 18, 0, Math.PI * 2);
        context.stroke();
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
    window.addEventListener("resize", resize);
    motion.addEventListener("change", onMotionChange);
    draw();
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", resize);
      motion.removeEventListener("change", onMotionChange);
    };
  }, []);

  return <canvas ref={canvasRef} className="startup-signal-network" aria-hidden="true" />;
}
