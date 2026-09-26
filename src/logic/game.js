// Thin wrapper holding the state plus an in-turn undo stack.
import { createGame } from './state.js';
import * as A from './actions.js';
import { planIntents } from './ai.js';
import { planSpawns } from './spawn.js';

export class Game {
  constructor(config, seed, mode = 'campaign') {
    this.state = createGame(config, seed, mode);
    planSpawns(this.state);
    planIntents(this.state);
    this.undoStack = [];
  }

  // Runs an action with a snapshot; the snapshot is kept only if it succeeds.
  run(fn) {
    const snap = structuredClone(this.state);
    const res = fn(this.state);
    if (res.ok) this.undoStack.push(snap);
    return res;
  }

  move(pieceId, toSq) { return this.run((s) => A.movePiece(s, pieceId, toSq)); }
  place(sq) {
    const snap = structuredClone(this.state);
    // Undoing a delayed redeploy returns to before the Redeploy button was pressed.
    if (snap.pendingPlacement?.kind === 'redeploy') snap.pendingPlacement = null;
    const res = A.placePending(this.state, sq);
    if (res.ok) this.undoStack.push(snap);
    return res;
  }
  startRedeploy(pieceId) { return A.startRedeploy(this.state, pieceId); }
  cancelPlacement() { return A.cancelPlacement(this.state); }

  endTurn() {
    const res = A.endTurn(this.state);
    if (res.ok) this.undoStack = [];
    return res;
  }

  canUndo() { return this.undoStack.length > 0; }

  undo() {
    if (!this.undoStack.length) return false;
    this.state = this.undoStack.pop();
    return true;
  }

  // Debug edits (not undoable, they clear the stack to keep it consistent).
  // Intents are re-planned so the arrows reflect the edited board.
  debugEdit(fn) {
    fn(this.state);
    planIntents(this.state);
    this.undoStack = [];
  }
}
