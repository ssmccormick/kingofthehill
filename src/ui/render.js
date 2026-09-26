// Canvas renderer. Reads game state; never mutates it.
import { edgeKind, SIDES } from '../logic/terrain.js';
import { findKing } from '../logic/state.js';
import { isInCheck } from '../logic/moves.js';

const GLYPHS = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
const VS15 = '︎'; // force text (non-emoji) presentation

const COLORS = {
  elev: [['#c9d4b0', '#c0cba6'], ['#dcc28f', '#d3b985'], ['#b98f58', '#b0864f']],
  step: '#3a2612',
  rampEdge: '#9c7a48',
  ramp: 'rgba(90,60,25,0.55)',
  deploy: 'rgba(40,95,170,0.85)',
  deployFill: 'rgba(40,95,170,0.07)',
  player: { fill: '#f7f7f2', stroke: '#1d3557' },
  enemy: { fill: '#c1121f', stroke: '#2b0000' },
  move: 'rgba(25,80,190,0.55)',
  capture: '#e63946',
  selected: '#ffd60a',
  placement: 'rgba(255,214,10,0.6)',
  threat: 'rgba(230,57,70,0.22)',
  intent: { move: '#f77f00', hit: '#d62828', invalid: '#8d99ae' },
  intentRing: 'rgba(247,127,0,0.9)',
};

export function render(canvas, state, view) {
  const t = state.terrain;
  const c = view.cell;
  const W = t.width, H = t.height;
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== W * c * dpr || canvas.height !== H * c * dpr) {
    canvas.width = W * c * dpr;
    canvas.height = H * c * dpr;
    canvas.style.width = `${W * c}px`;
    canvas.style.height = `${H * c}px`;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 1. Terrain
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sq = y * W + x;
      ctx.fillStyle = COLORS.elev[t.elev[sq]][(x + y) & 1];
      ctx.fillRect(x * c, y * c, c, c);
      if (t.deploy[sq]) { ctx.fillStyle = COLORS.deployFill; ctx.fillRect(x * c, y * c, c, c); }
      if (t.rampSide[sq]) drawRamp(ctx, x, y, c, t.rampSide[sq]);
    }
  }

  // 2. Threat overlay
  if (view.threat) {
    ctx.fillStyle = COLORS.threat;
    for (const sq of view.threat) ctx.fillRect((sq % W) * c, Math.floor(sq / W) * c, c, c);
  }

  // 3. Elevation edges (steps thick, ramp edges thin) and deploy outline
  const stepW = Math.max(3, Math.round(c * 0.12));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sq = y * W + x;
      if (x + 1 < W) drawEdge(ctx, edgeKind(t, sq, sq + 1), (x + 1) * c, y * c, (x + 1) * c, (y + 1) * c, stepW);
      if (y + 1 < H) drawEdge(ctx, edgeKind(t, sq, sq + W), x * c, (y + 1) * c, (x + 1) * c, (y + 1) * c, stepW);
    }
  }
  drawDeployOutline(ctx, t, c);

  // 4. Placement / move highlights
  if (view.placement) {
    for (const sq of view.placement) {
      const x = sq % W, y = Math.floor(sq / W);
      ctx.fillStyle = COLORS.placement;
      ctx.fillRect(x * c + 1, y * c + 1, c - 2, c - 2);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.strokeRect(x * c + 2, y * c + 2, c - 4, c - 4);
    }
  }
  if (view.selectedId && state.pieces[view.selectedId]) {
    const p = state.pieces[view.selectedId];
    ctx.strokeStyle = COLORS.selected;
    ctx.lineWidth = 3;
    ctx.strokeRect((p.sq % W) * c + 1.5, Math.floor(p.sq / W) * c + 1.5, c - 3, c - 3);
  }

  // 5. Check glow under the king
  const king = findKing(state, 'player');
  if (king && isInCheck(state, 'player')) {
    const cx = (king.sq % W + 0.5) * c, cy = (Math.floor(king.sq / W) + 0.5) * c;
    const g = ctx.createRadialGradient(cx, cy, c * 0.1, cx, cy, c * 0.75);
    g.addColorStop(0, 'rgba(255,0,0,0.9)');
    g.addColorStop(1, 'rgba(255,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - c, cy - c, 2 * c, 2 * c);
  }

  // 6. Pieces (enemies with an intent get a ring underneath)
  if (view.intents) {
    for (const { intent, status } of view.intents) {
      if (status === 'dead') continue;
      const p = state.pieces[intent.pieceId];
      ctx.strokeStyle = COLORS.intentRing;
      ctx.lineWidth = Math.max(2, c * 0.08);
      ctx.beginPath();
      ctx.arc((p.sq % W + 0.5) * c, (Math.floor(p.sq / W) + 0.5) * c, c * 0.46, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  const pendingId = state.pendingPlacement?.pieceId;
  for (const p of Object.values(state.pieces)) drawPiece(ctx, state, p, c, W, p.id === pendingId);

  // 6b. Spawn markers: ghost of the arriving enemy inside a dashed box
  for (const sp of view.spawns || []) drawSpawnMarker(ctx, sp, c, W, !!state.grid[sp.sq]);

  // 7. Move markers on top of pieces so captures read clearly
  for (const m of view.moves || []) {
    const x = m.to % W, y = Math.floor(m.to / W);
    if (m.capture) {
      ctx.strokeStyle = COLORS.capture;
      ctx.lineWidth = Math.max(2, c * 0.1);
      ctx.beginPath();
      ctx.arc((x + 0.5) * c, (y + 0.5) * c, c * 0.44, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = COLORS.move;
      ctx.beginPath();
      ctx.arc((x + 0.5) * c, (y + 0.5) * c, c * 0.17, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 8. Intent arrows
  if (view.intents) for (const it of view.intents) drawIntent(ctx, it, c, W);

  // 9. Hover
  if (view.hoverSq >= 0) {
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect((view.hoverSq % W) * c + 0.5, Math.floor(view.hoverSq / W) * c + 0.5, c - 1, c - 1);
  }
}

function drawSpawnMarker(ctx, sp, c, W, occupied) {
  const x = sp.sq % W, y = Math.floor(sp.sq / W);
  ctx.save();
  ctx.strokeStyle = COLORS.enemy.fill;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(x * c + 2, y * c + 2, c - 4, c - 4);
  ctx.setLineDash([]);
  if (!occupied) {
    ctx.globalAlpha = 0.38;
    ctx.font = `${Math.round(c * 0.72)}px "Segoe UI Symbol","Noto Sans Symbols 2","DejaVu Sans",serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.enemy.fill;
    ctx.fillText(GLYPHS[sp.type] + VS15, (x + 0.5) * c, (y + 0.54) * c);
  }
  ctx.restore();
}

function drawEdge(ctx, kind, x1, y1, x2, y2, stepW) {
  if (kind === 'flat') return;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  if (kind === 'step') {
    ctx.strokeStyle = COLORS.step;
    ctx.lineWidth = stepW;
    ctx.lineCap = 'square';
  } else {
    ctx.strokeStyle = COLORS.rampEdge;
    ctx.lineWidth = 1;
    ctx.lineCap = 'butt';
  }
  ctx.stroke();
}

// Arrow from the enemy to its destination, numbered by execution order.
// Red = will capture, orange = move, grey dashed = no longer valid (falls back).
// A purple "+" marks a planned check, a black "#" a planned checkmate.
function drawIntent(ctx, { intent, status }, c, W) {
  if (status === 'dead') return;
  const fx = (intent.from % W + 0.5) * c, fy = (Math.floor(intent.from / W) + 0.5) * c;
  const tx = (intent.to % W + 0.5) * c, ty = (Math.floor(intent.to / W) + 0.5) * c;
  const len = Math.hypot(tx - fx, ty - fy) || 1;
  const ux = (tx - fx) / len, uy = (ty - fy) / len;
  const sx = fx + ux * c * 0.38, sy = fy + uy * c * 0.38;
  const ex = tx - ux * c * 0.22, ey = ty - uy * c * 0.22;
  const color = COLORS.intent[status];
  const head = c * 0.34;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.globalAlpha = status === 'invalid' ? 0.75 : 0.9;
  ctx.lineWidth = Math.max(2.5, c * 0.11);
  ctx.lineCap = 'round';
  if (status === 'invalid') ctx.setLineDash([c * 0.18, c * 0.14]);
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex - ux * head * 0.6, ey - uy * head * 0.6);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - ux * head - uy * head * 0.55, ey - uy * head + ux * head * 0.55);
  ctx.lineTo(ex - ux * head + uy * head * 0.55, ey - uy * head - ux * head * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  // order badge at the enemy's top-left corner
  const bx = (intent.from % W) * c + c * 0.2, by = Math.floor(intent.from / W) * c + c * 0.2;
  ctx.beginPath();
  ctx.arc(bx, by, c * 0.19, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.round(c * 0.28)}px system-ui,sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(intent.order), bx, by + 0.5);

  if ((intent.check || intent.mate) && status !== 'invalid') {
    const mx = (intent.to % W + 1) * c - c * 0.2, my = Math.floor(intent.to / W) * c + c * 0.2;
    ctx.fillStyle = intent.mate ? '#000' : '#7b2cbf';
    ctx.beginPath();
    ctx.arc(mx, my, c * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(intent.mate ? '#' : '+', mx, my + 0.5);
  }
  ctx.restore();
}

// Chevrons pointing uphill (inward, opposite the ramp's side).
function drawRamp(ctx, x, y, c, side) {
  const up = { N: [0, 1], S: [0, -1], W: [1, 0], E: [-1, 0] }[side];
  const cx = (x + 0.5) * c, cy = (y + 0.5) * c;
  ctx.strokeStyle = COLORS.ramp;
  ctx.lineWidth = Math.max(1.5, c * 0.07);
  for (const off of [-0.18, 0.12]) {
    const tipX = cx + up[0] * c * (off + 0.12), tipY = cy + up[1] * c * (off + 0.12);
    const baseX = cx + up[0] * c * off, baseY = cy + up[1] * c * off;
    const px = up[1] * c * 0.25, py = up[0] * c * 0.25; // perpendicular
    ctx.beginPath();
    ctx.moveTo(baseX + px - up[0] * c * 0.1, baseY + py - up[1] * c * 0.1);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(baseX - px - up[0] * c * 0.1, baseY - py - up[1] * c * 0.1);
    ctx.stroke();
  }
}

function drawDeployOutline(ctx, t, c) {
  const W = t.width, H = t.height;
  ctx.strokeStyle = COLORS.deploy;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  const inZone = (x, y) => x >= 0 && y >= 0 && x < W && y < H && t.deploy[y * W + x];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!t.deploy[y * W + x]) continue;
      const i = 2.5; // inset so it doesn't collide with step lines
      if (!inZone(x, y - 1)) { ctx.moveTo(x * c, y * c + i); ctx.lineTo((x + 1) * c, y * c + i); }
      if (!inZone(x, y + 1)) { ctx.moveTo(x * c, (y + 1) * c - i); ctx.lineTo((x + 1) * c, (y + 1) * c - i); }
      if (!inZone(x - 1, y)) { ctx.moveTo(x * c + i, y * c); ctx.lineTo(x * c + i, (y + 1) * c); }
      if (!inZone(x + 1, y)) { ctx.moveTo((x + 1) * c - i, y * c); ctx.lineTo((x + 1) * c - i, (y + 1) * c); }
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawPiece(ctx, state, p, c, W, pending) {
  const x = p.sq % W, y = Math.floor(p.sq / W);
  const cx = (x + 0.5) * c, cy = (y + 0.5) * c;
  const col = COLORS[p.side];
  const acted = p.side === 'player' && (p.movesThisTurn > 0 || p.lockedThisTurn);
  ctx.save();
  if (acted || pending) ctx.globalAlpha = 0.5;
  ctx.font = `${Math.round(c * 0.82)}px "Segoe UI Symbol","Noto Sans Symbols 2","DejaVu Sans",serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const glyph = GLYPHS[p.type] + VS15;
  ctx.lineWidth = Math.max(2, c * 0.09);
  ctx.strokeStyle = col.stroke;
  ctx.lineJoin = 'round';
  ctx.strokeText(glyph, cx, cy + c * 0.04);
  ctx.fillStyle = col.fill;
  ctx.fillText(glyph, cx, cy + c * 0.04);
  ctx.restore();

  // Pawn facing tick
  if (p.type === 'P' && SIDES[p.facing]) {
    const f = SIDES[p.facing];
    const tx = cx + f.dx * c * 0.44, ty = cy + f.dy * c * 0.44;
    const s = c * 0.09;
    ctx.fillStyle = p.side === 'player' ? '#1d3557' : '#7a0010';
    ctx.beginPath();
    ctx.moveTo(tx + f.dx * s, ty + f.dy * s);
    ctx.lineTo(tx - f.dx * s + f.dy * s, ty - f.dy * s + f.dx * s);
    ctx.lineTo(tx - f.dx * s - f.dy * s, ty - f.dy * s - f.dx * s);
    ctx.closePath();
    ctx.fill();
  }
  // Capture-count badge on player pawns
  if (p.side === 'player' && p.type === 'P') {
    const r = c * 0.17;
    const bx = (x + 1) * c - r - 1, by = y * c + r + 1;
    ctx.fillStyle = p.captures ? '#e9a100' : '#556';
    ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.round(r * 1.5)}px system-ui,sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(p.captures), bx, by + 0.5);
  }
  if (p.canRedeploy) {
    ctx.fillStyle = '#00b4d8';
    ctx.font = `bold ${Math.round(c * 0.36)}px system-ui,sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText('↻', x * c + 1, (y + 1) * c);
  }
}
