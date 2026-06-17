/**
 * Draws a procedural club scene on a canvas element.
 * Replicates the original HTML shell's drawClubScene function.
 */
export function drawClubScene(canvas, seed) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = '#0d0408';
  ctx.fillRect(0, 0, w, h);

  const cols = ['#ff3366', '#3366ff', '#ff6600', '#9933ff', '#00ccff'];

  for (let i = 0; i < 6; i++) {
    const x = (seed * 37 + i * 60) % w;
    const r = 20 + i * 8;
    const g = ctx.createRadialGradient(x, h * 0.3, 0, x, h * 0.3, r);
    g.addColorStop(0, cols[(seed + i) % cols.length] + '99');
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, h * 0.3, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#ffffff22';
  for (let i = 0; i < 20; i++) {
    ctx.fillRect((seed * 13 + i * 17) % w, (seed * 7 + i * 11) % h, 1, 1);
  }

  ctx.fillStyle = '#1a0808aa';
  ctx.fillRect(0, h * 0.5, w, h * 0.5);
}
