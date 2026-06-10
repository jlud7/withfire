import { useEffect, useRef } from "react";

/**
 * Ember sparks that trail the cursor and burst on clicks.
 * Mouse-only: does nothing on touch devices or under reduced motion.
 * The rAF loop runs only while sparks are alive, so an idle cursor
 * costs nothing.
 */
export function CursorSparks() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = devicePixelRatio;
    let raf = 0;
    let w = 0;
    let h = 0;

    const resize = () => {
      w = canvas.width = window.innerWidth * dpr;
      h = canvas.height = window.innerHeight * dpr;
    };
    resize();
    window.addEventListener("resize", resize);

    interface S {
      x: number; y: number; vx: number; vy: number;
      r: number; hue: number; life: number; ttl: number;
    }
    const parts: S[] = [];
    let running = false;
    let last = 0;

    const spark = (x: number, y: number, speed: number): S => {
      const a = Math.random() * Math.PI * 2;
      const v = (0.2 + Math.random() * speed) * dpr;
      return {
        x: x * dpr,
        y: y * dpr,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 0.45 * dpr, // sparks drift up, like off a fire
        r: (0.6 + Math.random() * 1.3) * dpr,
        hue: 18 + Math.random() * 30,
        life: 0,
        ttl: 0.35 + Math.random() * 0.45,
      };
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life += dt;
        if (p.life >= p.ttl) {
          parts.splice(i, 1);
          continue;
        }
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.96;
        const fade = 1 - p.life / p.ttl;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3.5);
        g.addColorStop(0, `hsla(${p.hue}, 100%, 64%, ${0.85 * fade})`);
        g.addColorStop(1, `hsla(${p.hue}, 100%, 50%, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (parts.length > 0) {
        raf = requestAnimationFrame(tick);
      } else {
        running = false;
        ctx.clearRect(0, 0, w, h);
      }
    };

    const ensure = () => {
      if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };

    // Trail: one faint spark per ~24px of cursor travel.
    let lx = -1;
    let ly = -1;
    let dist = 0;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      if (lx >= 0) {
        dist += Math.hypot(e.clientX - lx, e.clientY - ly);
        while (dist > 24) {
          dist -= 24;
          if (parts.length < 80) parts.push(spark(e.clientX, e.clientY, 0.5));
        }
      }
      lx = e.clientX;
      ly = e.clientY;
      ensure();
    };

    // Click: a small burst, like striking a match.
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      for (let i = 0; i < 12 && parts.length < 110; i++) {
        parts.push(spark(e.clientX, e.clientY, 2.6));
      }
      ensure();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
    };
  }, []);

  return <canvas className="cursor-sparks" ref={ref} aria-hidden />;
}
