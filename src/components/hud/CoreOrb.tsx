"use client";

import { useEffect, useRef, useState } from "react";

export type OrbState = "idle" | "thinking" | "tool" | "error" | "success";

interface CoreOrbProps {
  state?: OrbState;
  /** Show the state label under the core (default off — parents usually add their own). */
  showLabel?: boolean;
  /** Sizing/positioning classes. The orb fills this box and stays centered. */
  className?: string;
  "data-testid"?: string;
}

const STATE_CONFIG: Record<OrbState, { color: string; glow: string; label: string }> = {
  idle:     { color: "#ff6a00", glow: "rgba(255, 106, 0, 0.40)",   label: "STANDBY"  },
  thinking: { color: "#ff8c1a", glow: "rgba(255, 140, 26, 0.55)",  label: "THINKING" },
  tool:     { color: "#ffab40", glow: "rgba(255, 171, 64, 0.45)",  label: "EXECUTING"},
  error:    { color: "#ff3b30", glow: "rgba(255, 59, 48, 0.45)",   label: "ERROR"    },
  success:  { color: "#ffc042", glow: "rgba(255, 192, 66, 0.40)",  label: "DONE"     },
};

const SIZE = 240;          // logical canvas units; CSS scales to the container
const C = SIZE / 2;        // center — everything draws around this, always centered

/** Reactive futuristic core: reticle rings, segmented arcs, orbiting particles. */
export default function CoreOrb({
  state = "idle",
  showLabel = false,
  className = "h-48 w-48",
  "data-testid": testId = "core-orb",
}: CoreOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const stateRef = useRef<OrbState>(state);
  const [ripples, setRipples] = useState<{ id: number }[]>([]);
  const prev = useRef<OrbState>(state);

  useEffect(() => { stateRef.current = state; }, [state]);

  // Ripple burst when entering/leaving "tool"
  useEffect(() => {
    if (state !== prev.current && (state === "tool" || prev.current === "tool")) {
      const id = Date.now();
      setRipples((r) => [...r, { id }]);
      setTimeout(() => setRipples((r) => r.filter((x) => x.id !== id)), 1300);
    }
    prev.current = state;
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    ctx.scale(dpr, dpr);

    const particles = Array.from({ length: 34 }, () => ({
      angle: Math.random() * Math.PI * 2,
      dist: 66 + Math.random() * 34,
      speed: (Math.random() * 0.4 + 0.15) * (Math.random() < 0.5 ? 1 : -1),
      size: Math.random() * 1.6 + 0.4,
    }));

    let t = 0;
    const draw = () => {
      t += 16;
      const st = stateRef.current;
      const cfg = STATE_CONFIG[st];
      const col = cfg.color;
      const fast = st === "thinking";
      const speed = fast ? 1.9 : st === "idle" ? 0.6 : 1.2;
      ctx.clearRect(0, 0, SIZE, SIZE);

      // ── faint reticle crosshair ──
      ctx.strokeStyle = col + "14";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(C - 112, C); ctx.lineTo(C + 112, C);
      ctx.moveTo(C, C - 112); ctx.lineTo(C, C + 112);
      ctx.stroke();

      // ── outer tick ring (reticle) ──
      const R = 104;
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2 + t * 0.00012;
        const long = i % 6 === 0;
        const r1 = R - (long ? 8 : 4);
        ctx.beginPath();
        ctx.moveTo(C + Math.cos(a) * r1, C + Math.sin(a) * r1);
        ctx.lineTo(C + Math.cos(a) * R, C + Math.sin(a) * R);
        ctx.strokeStyle = col + (long ? "55" : "24");
        ctx.lineWidth = long ? 1.4 : 0.8;
        ctx.stroke();
      }

      // ── rotating segmented arcs (two rings, opposite spin) ──
      const seg = (radius: number, dir: number, alpha: string, segs: number, gap: number, sp: number) => {
        ctx.save();
        ctx.translate(C, C);
        ctx.rotate(t * sp * dir * speed);
        for (let i = 0; i < segs; i++) {
          const a0 = (i / segs) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(0, 0, radius, a0, a0 + (Math.PI * 2) / segs - gap);
          ctx.strokeStyle = col + alpha;
          ctx.lineWidth = 2;
          ctx.lineCap = "round";
          ctx.stroke();
        }
        ctx.restore();
      };
      seg(88, 1, "aa", 3, 0.5, 0.00035);
      seg(76, -1, "55", 5, 0.35, 0.0006);

      // ── outer glow halo ──
      const pulse = 1 + Math.sin(t * 0.003) * 0.05 * (fast ? 3 : 1);
      const halo = ctx.createRadialGradient(C, C, 6, C, C, 60 * pulse);
      halo.addColorStop(0, col + "cc");
      halo.addColorStop(0.4, col + "55");
      halo.addColorStop(1, "transparent");
      ctx.beginPath();
      ctx.arc(C, C, 60 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = halo;
      ctx.fill();

      // ── rim ring around core ──
      ctx.beginPath();
      ctx.arc(C, C, 34, 0, Math.PI * 2);
      ctx.strokeStyle = col + "cc";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // ── core sphere (offset highlight for a 3D read) ──
      const core = ctx.createRadialGradient(C - 10, C - 12, 3, C, C, 32);
      core.addColorStop(0, "#fff6ec");
      core.addColorStop(0.35, col + "ee");
      core.addColorStop(1, col + "66");
      ctx.beginPath();
      ctx.arc(C, C, 30, 0, Math.PI * 2);
      ctx.fillStyle = core;
      ctx.fill();

      // ── inner fast dashed ring while thinking ──
      if (fast) {
        ctx.save();
        ctx.translate(C, C);
        ctx.rotate(t * 0.004);
        ctx.beginPath();
        ctx.arc(0, 0, 46, 0, Math.PI * 1.6);
        ctx.strokeStyle = col + "aa";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.restore();
      }

      // ── orbiting particles ──
      for (const p of particles) {
        p.angle += p.speed * 0.01 * speed;
        const px = C + Math.cos(p.angle) * p.dist;
        const py = C + Math.sin(p.angle) * p.dist;
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fillStyle = col + "cc";
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  const cfg = STATE_CONFIG[state];

  return (
    <div
      data-testid={testId}
      data-orb-state={state}
      className={`relative grid place-items-center ${className}`}
    >
      {ripples.map((r) => (
        <div
          key={r.id}
          className="pointer-events-none absolute inset-0 rounded-full border"
          style={{ borderColor: cfg.color + "88", animation: "orb-ripple 1.2s ease-out forwards" }}
        />
      ))}

      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ filter: `drop-shadow(0 0 22px ${cfg.glow})` }}
      />

      {showLabel && (
        <div
          className="absolute -bottom-5 left-1/2 -translate-x-1/2 font-mono uppercase"
          style={{ color: cfg.color, fontSize: 10, letterSpacing: "3px" }}
        >
          {cfg.label}
        </div>
      )}
    </div>
  );
}
