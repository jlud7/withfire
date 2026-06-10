import { useEffect, useRef } from "react";

/** Ambient floating embers, drawn on a fixed canvas behind the UI. */
export function Embers() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let w = 0;
    let h = 0;

    interface P {
      x: number; y: number; r: number; vx: number; vy: number;
      hue: number; alpha: number; flicker: number;
    }
    const parts: P[] = [];

    const resize = () => {
      w = canvas.width = window.innerWidth * devicePixelRatio;
      h = canvas.height = window.innerHeight * devicePixelRatio;
    };
    resize();
    window.addEventListener("resize", resize);

    const spawn = (): P => ({
      x: Math.random() * w,
      y: h + 20 * devicePixelRatio,
      r: (0.8 + Math.random() * 2.2) * devicePixelRatio,
      vx: (Math.random() - 0.5) * 0.35 * devicePixelRatio,
      vy: -(0.25 + Math.random() * 0.8) * devicePixelRatio,
      hue: 18 + Math.random() * 26,
      alpha: 0.25 + Math.random() * 0.5,
      flicker: Math.random() * Math.PI * 2,
    });

    const COUNT = Math.min(70, Math.floor(window.innerWidth / 14));
    for (let i = 0; i < COUNT; i++) {
      const p = spawn();
      p.y = Math.random() * h;
      parts.push(p);
    }

    let t = 0;
    const tick = () => {
      t += 0.016;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.x += p.vx + Math.sin(t * 1.3 + p.flicker) * 0.18 * devicePixelRatio;
        p.y += p.vy;
        if (p.y < -20) parts[i] = spawn();
        const a = p.alpha * (0.6 + 0.4 * Math.sin(t * 3 + p.flicker));
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        g.addColorStop(0, `hsla(${p.hue}, 100%, 62%, ${a})`);
        g.addColorStop(1, `hsla(${p.hue}, 100%, 50%, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas className="embers" ref={ref} aria-hidden />;
}
