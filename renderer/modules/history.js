/**
 * Pile d'historique générique (snapshots opaques).
 * Garde au plus `limit` étapes pour ne pas exploser la RAM sur de gros sprites.
 */
export class HistoryStack {
  constructor(limit = 50) {
    this.limit = limit;
    this.stack = [];
    this.cursor = -1;
  }

  push(snapshot) {
    // Si on est revenu en arrière puis on dessine, on coupe le futur.
    if (this.cursor < this.stack.length - 1) {
      this.stack.length = this.cursor + 1;
    }
    this.stack.push(snapshot);
    if (this.stack.length > this.limit) {
      this.stack.shift();
    } else {
      this.cursor++;
    }
  }

  undo() {
    if (this.cursor <= 0) return null;
    this.cursor--;
    return this.stack[this.cursor];
  }

  redo() {
    if (this.cursor >= this.stack.length - 1) return null;
    this.cursor++;
    return this.stack[this.cursor];
  }

  current() {
    return this.stack[this.cursor] || null;
  }

  canUndo() { return this.cursor > 0; }
  canRedo() { return this.cursor < this.stack.length - 1; }

  clear() {
    this.stack = [];
    this.cursor = -1;
  }
}
