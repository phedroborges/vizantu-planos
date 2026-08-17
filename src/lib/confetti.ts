// Confete feito à mão (canvas 2D, zero dependência) — mesma filosofia do
// approval-client.js legado, que também não usa nenhuma lib de animação.
// burst() dispara um punhado de partículas caindo com gravidade + rotação a
// partir de um ponto de origem (ex.: o botão que acabou de ser clicado).

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  life: number;
};

const COLORS = ["#9147ff", "#2f8f4e", "#d99a1f", "#6435e7", "#3fae63", "#f2c94c"];

export function burst(originX: number, originY: number, count = 40) {
  if (typeof document === "undefined") return;
  const canvas = document.createElement("canvas");
  canvas.className = "cd-confetti-canvas";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const particles: Particle[] = Array.from({ length: count }, () => ({
    x: originX,
    y: originY,
    vx: (Math.random() - 0.5) * 9,
    vy: -Math.random() * 9 - 3,
    size: Math.random() * 6 + 4,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - 0.5) * 0.3,
    life: 1,
  }));

  let frame = 0;
  function tick() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    for (const p of particles) {
      p.vy += 0.28;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;
      p.life -= 0.012;
      if (p.life <= 0) continue;
      alive = true;
      ctx.save();
      ctx.globalAlpha = Math.max(p.life, 0);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
    frame++;
    if (alive && frame < 240) {
      requestAnimationFrame(tick);
    } else {
      canvas.remove();
    }
  }
  requestAnimationFrame(tick);
}
