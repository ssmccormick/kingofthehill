// Input + DOM layer. All rules live in src/logic; this file only wires UI to them.
import { DEFAULT_CONFIG, mergeConfig } from '../config.js';
import { Game } from '../logic/game.js';
import { addPiece, removePiece, PIECE_NAMES, xyOf } from '../logic/state.js';
import { attackedSquares, isInCheck, slideRange } from '../logic/moves.js';
import { availableMoves, pieceBlockedReason, currentPlacementSquares, startPlayerTurn } from '../logic/actions.js';
import { promotionPieceFor } from '../logic/promotion.js';
import { inwardFacing, OPPOSITE } from '../logic/terrain.js';
import { randomSeed } from '../logic/rng.js';
import { render } from './render.js';

const $ = (id) => document.getElementById(id);
const canvas = $('board');
const DEV_KEY = 'koth.devOverrides';

let overrides = loadOverrides();
let game;
const view = { cell: 28, selectedId: null, moves: [], hoverSq: -1, showThreat: false, tool: '', message: '' };

function loadOverrides() {
  try { return JSON.parse(localStorage.getItem(DEV_KEY)) || {}; } catch { return {}; }
}
function saveOverrides() {
  try { localStorage.setItem(DEV_KEY, JSON.stringify(overrides)); } catch { /* ignore */ }
}

function newGame(seed) {
  game = new Game(mergeConfig(DEFAULT_CONFIG, overrides), seed);
  const url = new URL(location.href);
  url.searchParams.set('seed', game.state.seed);
  history.replaceState(null, '', url);
  clearSelection();
  fitCell();
  refresh();
}

function fitCell() {
  const t = game.state.terrain;
  const wrap = $('boardWrap');
  const avail = Math.min((wrap.clientHeight - 24) / t.height, (wrap.clientWidth - 24) / t.width);
  view.cell = Math.max(16, Math.min(48, Math.floor(avail)));
}

function clearSelection() {
  view.selectedId = null;
  view.moves = [];
}

function select(id) {
  view.selectedId = id;
  view.moves = id ? availableMoves(game.state, id) : [];
}

function flash(msg) {
  view.message = msg;
  refresh();
}

// ---------- input ----------
function squareFromEvent(e) {
  const r = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / view.cell);
  const y = Math.floor((e.clientY - r.top) / view.cell);
  const t = game.state.terrain;
  if (x < 0 || y < 0 || x >= t.width || y >= t.height) return -1;
  return y * t.width + x;
}

canvas.addEventListener('click', (e) => {
  const sq = squareFromEvent(e);
  if (sq < 0) return;
  view.message = '';
  const s = game.state;

  if (view.tool) return devClick(sq);

  if (s.pendingPlacement) {
    const res = game.place(sq);
    if (!res.ok) view.message = res.error;
    clearSelection();
    return refresh();
  }

  if (view.selectedId) {
    const m = view.moves.find((mv) => mv.to === sq);
    if (m) {
      const res = game.move(view.selectedId, sq);
      if (!res.ok) view.message = res.error;
      clearSelection();
      return refresh();
    }
  }
  const occ = s.grid[sq];
  if (occ && s.pieces[occ].side === 'player' && occ !== view.selectedId) {
    select(occ);
    const why = pieceBlockedReason(s, s.pieces[occ]);
    if (why) view.message = why;
    else if (!view.moves.length) view.message = isInCheck(s) ? 'That piece cannot resolve the check' : 'No legal moves';
  } else {
    clearSelection();
  }
  refresh();
});

canvas.addEventListener('mousemove', (e) => {
  const sq = squareFromEvent(e);
  if (sq !== view.hoverSq) {
    view.hoverSq = sq;
    refresh();
  }
  updateTooltip(e, sq);
});
canvas.addEventListener('mouseleave', () => {
  view.hoverSq = -1;
  $('tooltip').hidden = true;
  refresh();
});

function updateTooltip(e, sq) {
  const tip = $('tooltip');
  const p = sq >= 0 ? game.state.pieces[game.state.grid[sq]] : null;
  if (!p) { tip.hidden = true; return; }
  let text = `${p.side === 'player' ? '' : 'Enemy '}${PIECE_NAMES[p.type]}`;
  if (p.type === 'P') text += ` · facing ${p.facing}`;
  if (p.side === 'player' && p.type === 'P') {
    const into = promotionPieceFor(game.state.config.promotion.table, p.captures);
    text += ` · ${p.captures} capture${p.captures === 1 ? '' : 's'} · promotes to ${PIECE_NAMES[into]} now`;
  }
  if ('RBQ'.includes(p.type)) text += ` · range ${slideRange(game.state, p)}`;
  tip.textContent = text;
  tip.hidden = false;
  tip.style.left = `${e.clientX + 14}px`;
  tip.style.top = `${e.clientY + 14}px`;
}

document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select')) return;
  if (e.key === 'Enter') doEndTurn();
  else if (e.key === 'z' || e.key === 'Z') doUndo();
  else if (e.key === 'Escape') {
    if (game.state.pendingPlacement?.kind === 'redeploy') game.cancelPlacement();
    view.tool = '';
    $('devTool').value = '';
    clearSelection();
    refresh();
  }
});

function doEndTurn() {
  const res = game.endTurn();
  view.message = res.ok ? '' : res.error;
  clearSelection();
  refresh();
}
function doUndo() {
  if (game.undo()) view.message = '';
  clearSelection();
  refresh();
}

$('btnEndTurn').onclick = doEndTurn;
$('btnUndo').onclick = doUndo;
$('btnRestart').onclick = () => newGame(game.state.seed);
$('btnNewSeed').onclick = () => newGame(randomSeed());
$('btnZoomIn').onclick = () => { view.cell = Math.min(64, view.cell + 4); refresh(); };
$('btnZoomOut').onclick = () => { view.cell = Math.max(12, view.cell - 4); refresh(); };
$('chkThreat').onchange = (e) => { view.showThreat = e.target.checked; refresh(); };

// ---------- dev panel ----------
function devClick(sq) {
  const s = game.state;
  if (view.tool === 'erase') {
    if (s.grid[sq]) game.debugEdit((st) => removePiece(st, st.grid[sq]));
    return refresh();
  }
  const [side, type] = view.tool.split(':');
  if (s.grid[sq]) return flash('Square occupied');
  let facing = $('devFacing').value;
  if (facing === 'auto') {
    const inward = inwardFacing(s.terrain, sq);
    facing = side === 'enemy' ? inward : OPPOSITE[inward];
  }
  game.debugEdit((st) => addPiece(st, { type, side, sq, facing }));
  clearSelection();
  refresh();
}

function fillDevPanel() {
  const c = mergeConfig(DEFAULT_CONFIG, overrides);
  $('devBoard').value = c.board.width;
  $('devPlateau').value = c.board.plateauSize;
  $('devSummit').value = c.board.summitSize;
  $('devRamp').value = c.board.ramps[0]?.width ?? 2;
  $('devRing').value = c.board.deployRingWidth;
  $('devAP').value = c.turn.apPerTurn;
  $('devRepeat').checked = !c.turn.onePieceMovePerTurn;
}

$('devApply').onclick = () => {
  const n = (id) => Number($(id).value);
  const rampW = n('devRamp');
  overrides = {
    board: {
      width: n('devBoard'), height: n('devBoard'), plateauSize: n('devPlateau'), summitSize: n('devSummit'),
      deployRingWidth: n('devRing'),
      ramps: ['N', 'E', 'S', 'W'].map((side) => ({ side, start: null, width: rampW })),
    },
    turn: { apPerTurn: n('devAP'), onePieceMovePerTurn: !$('devRepeat').checked },
  };
  saveOverrides();
  newGame(game.state.seed);
};
$('devReset').onclick = () => {
  overrides = {};
  saveOverrides();
  fillDevPanel();
  newGame(game.state.seed);
};
$('devTool').onchange = (e) => { view.tool = e.target.value; clearSelection(); refresh(); };
$('devClearEnemies').onclick = () => {
  game.debugEdit((st) => { for (const p of Object.values(st.pieces)) if (p.side === 'enemy') removePiece(st, p.id); });
  refresh();
};
$('devRefreshTurn').onclick = () => {
  game.debugEdit((st) => startPlayerTurn(st));
  clearSelection();
  refresh();
};

// ---------- panels ----------
function refresh() {
  const s = game.state;
  if (view.selectedId && !s.pieces[view.selectedId]) clearSelection();
  if (view.selectedId) view.moves = availableMoves(s, view.selectedId);

  render(canvas, s, {
    cell: view.cell,
    selectedId: view.selectedId,
    moves: view.moves,
    hoverSq: view.hoverSq,
    threat: view.showThreat ? attackedSquares(s, 'enemy') : null,
    placement: s.pendingPlacement ? currentPlacementSquares(s) : null,
  });

  const inCheck = isInCheck(s);
  $('hud').innerHTML = [
    `<span class="ap">AP <b>${s.ap}</b></span>`,
    `<span>Turn <b>${s.turn}</b></span>`,
    `<span>Wave <b>—</b></span>`,
    `<span>Mode <b>Sandbox</b></span>`,
    `<span>Seed <b>${s.seed}</b></span>`,
    inCheck ? '<span class="warn"><b>CHECK!</b></span>' : '',
  ].join('');

  $('btnUndo').disabled = !game.canUndo();
  $('btnEndTurn').disabled = s.pendingPlacement?.kind === 'promotion' || s.status !== 'playing';

  const banner = $('banner');
  let bannerText = '';
  banner.classList.remove('danger');
  if (s.status === 'lost') { bannerText = 'Checkmate — game over. Restart or pick a new seed.'; banner.classList.add('danger'); }
  else if (s.pendingPlacement) {
    const p = s.pieces[s.pendingPlacement.pieceId];
    bannerText = `Place your ${PIECE_NAMES[p.type]} on a highlighted deployment square${s.pendingPlacement.kind === 'redeploy' ? ' (Esc to cancel)' : ''}.`;
  } else if (view.tool) bannerText = `Dev tool active: ${$('devTool').selectedOptions[0].text}. Click the board. Esc to stop.`;
  else if (view.message) bannerText = view.message;
  else if (inCheck) { bannerText = 'Your king is in check — your next move must resolve it.'; banner.classList.add('danger'); }
  banner.hidden = !bannerText;
  banner.textContent = bannerText;

  renderSelection();
  renderHover();
  renderLog();
}

function renderSelection() {
  const s = game.state;
  const el = $('selection');
  const p = s.pieces[view.selectedId];
  if (!p) {
    el.innerHTML = '<span class="muted">Click one of your pieces to see its moves. Dots = moves, red rings = captures.</span>';
    return;
  }
  const { x, y } = xyOf(s, p.sq);
  const lines = [`<div class="sel-title">${PIECE_NAMES[p.type]} at ${x},${y} (level ${s.terrain.elev[p.sq]})</div>`];
  if ('RBQ'.includes(p.type)) lines.push(`Range: ${slideRange(s, p)}`);
  if (p.type === 'P') {
    const into = promotionPieceFor(s.config.promotion.table, p.captures);
    lines.push(`Facing ${p.facing} · ${p.captures} capture(s) · would promote to <b>${PIECE_NAMES[into]}</b>`);
  }
  lines.push(`${view.moves.length} legal move(s)`);
  const why = pieceBlockedReason(s, p);
  if (why) lines.push(`<span class="warn">${why}</span>`);
  el.innerHTML = lines.join('<br>');
  if (p.canRedeploy) {
    const b = document.createElement('button');
    b.textContent = `Redeploy (${s.config.promotion.delayedRedeployAPCost} AP)`;
    b.style.marginTop = '6px';
    b.onclick = () => {
      const res = game.startRedeploy(p.id);
      view.message = res.ok ? '' : res.error;
      clearSelection();
      refresh();
    };
    el.appendChild(document.createElement('br'));
    el.appendChild(b);
  }
}

function renderHover() {
  const s = game.state;
  const sq = view.hoverSq;
  if (sq < 0) { $('hoverInfo').textContent = 'Hover a square for details.'; return; }
  const t = s.terrain;
  const { x, y } = xyOf(s, sq);
  const bits = [`${x},${y}`, `level ${t.elev[sq]}`];
  if (t.rampSide[sq]) bits.push(`ramp (${t.rampSide[sq]})`);
  if (t.summitAdj[sq]) bits.push('summit access');
  if (t.deploy[sq]) bits.push('deployment zone');
  $('hoverInfo').textContent = bits.join(' · ');
}

function renderLog() {
  const s = game.state;
  const ol = $('log');
  ol.innerHTML = s.log.slice(-200).reverse().map((l) => `<li><span class="t">T${l.turn}</span>${escapeHtml(l.text)}</li>`).join('');
}

function escapeHtml(str) {
  return str.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]);
}

window.addEventListener('resize', () => refresh());

// ---------- boot ----------
fillDevPanel();
const urlSeed = new URL(location.href).searchParams.get('seed');
newGame(urlSeed != null && urlSeed !== '' ? urlSeed : DEFAULT_CONFIG.seed);

// Exposed for console debugging.
window.koth = { get game() { return game; }, refresh };
