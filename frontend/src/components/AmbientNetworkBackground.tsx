import { useEffect, useRef } from "react";

export function AmbientNetworkBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const context = canvas.getContext("2d"); if (!context) return;
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)"); let reduced = motionPreference.matches;
    let frame = 0; let animationId = 0; let width = 0; let height = 0;
    const nodes = Array.from({ length: 18 }, (_, index) => ({ x: (index * 137) % 1000, y: (index * 223) % 720, dx: ((index % 3) - 1) * 0.055, dy: ((index % 4) - 1.5) * 0.045, pulse: index === 3 || index === 13 }));
    const draw = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2); width = window.innerWidth; height = window.innerHeight;
      if (canvas.width !== width * ratio || canvas.height !== height * ratio) { canvas.width = width * ratio; canvas.height = height * ratio; canvas.style.width = `${width}px`; canvas.style.height = `${height}px`; context.setTransform(ratio, 0, 0, ratio, 0, 0); }
      context.clearRect(0, 0, width, height); const scaleX = width / 1000; const scaleY = height / 720;
      nodes.forEach((node) => { if (!reduced) { node.x = (node.x + node.dx + 1000) % 1000; node.y = (node.y + node.dy + 720) % 720; } });
      context.lineWidth = 1; nodes.forEach((node, index) => nodes.slice(index + 1).forEach((other) => { const x = (node.x - other.x) * scaleX; const y = (node.y - other.y) * scaleY; if (Math.hypot(x, y) < 245) { context.strokeStyle = "rgba(198, 193, 195, 0.15)"; context.beginPath(); context.moveTo(node.x * scaleX, node.y * scaleY); context.lineTo(other.x * scaleX, other.y * scaleY); context.stroke(); } }));
      const burstProgress = (frame % 240) / 240; const sourceIndex = Math.floor(frame / 240) % nodes.length; const source = nodes[sourceIndex];
      if (source && !reduced) {
        const closest = nodes.filter((_, index) => index !== sourceIndex).map((node) => ({ node, distance: Math.hypot((node.x - source.x) * scaleX, (node.y - source.y) * scaleY) })).sort((a, b) => a.distance - b.distance).slice(0, 3);
        closest.forEach(({ node }, index) => { const intensity = Math.max(0, 1 - Math.abs(burstProgress - (0.2 + index * 0.12)) * 5); if (!intensity) return; context.strokeStyle = `rgba(210, 52, 76, ${0.12 + intensity * 0.35})`; context.lineWidth = 1.2; context.beginPath(); context.moveTo(source.x * scaleX, source.y * scaleY); context.lineTo(node.x * scaleX, node.y * scaleY); context.stroke(); });
        const radius = 8 + burstProgress * 115; context.strokeStyle = `rgba(210, 52, 76, ${Math.max(0, 0.22 - burstProgress * 0.22)})`; context.lineWidth = 1; context.beginPath(); context.arc(source.x * scaleX, source.y * scaleY, radius, 0, Math.PI * 2); context.stroke();
      }
      nodes.forEach((node) => { const alpha = node.pulse ? 0.32 + Math.sin(frame / 55) * 0.13 : 0.29; context.fillStyle = node.pulse ? `rgba(214,37,64,${alpha})` : `rgba(220,215,217,${alpha})`; context.beginPath(); context.arc(node.x * scaleX, node.y * scaleY, node.pulse ? 3 : 2, 0, Math.PI * 2); context.fill(); });
      if (!reduced) { frame += 1; animationId = requestAnimationFrame(draw); }
    };
    const onMotionChange = (event: MediaQueryListEvent) => { reduced = event.matches; cancelAnimationFrame(animationId); draw(); };
    motionPreference.addEventListener("change", onMotionChange); draw(); return () => { cancelAnimationFrame(animationId); motionPreference.removeEventListener("change", onMotionChange); };
  }, []);
  return <canvas className="ambient-network" ref={canvasRef} aria-hidden="true" />;
}
