/** Where the walkthrough card goes: beside its targets, never over them or over open panels. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

const right = (b: Box) => b.left + b.width;
const bottom = (b: Box) => b.top + b.height;

export function overlapArea(a: Box, b: Box): number {
  const w = Math.min(right(a), right(b)) - Math.max(a.left, b.left);
  const h = Math.min(bottom(a), bottom(b)) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Shortest distance between two boxes (0 when they touch or overlap) */
function distance(a: Box, b: Box): number {
  const dx = Math.max(0, b.left - right(a), a.left - right(b));
  const dy = Math.max(0, b.top - bottom(a), a.top - bottom(b));
  return Math.hypot(dx, dy);
}

const grow = (b: Box, by: number): Box => ({ left: b.left - by, top: b.top - by, width: b.width + by * 2, height: b.height + by * 2 });

/**
 * Desktop card. targets[0] is the one to sit next to; every target and obstacle is avoided if at all possible.
 * With no target the card is centred.
 */
export function placeCoachmark({
  viewport,
  card,
  targets,
  obstacles = [],
  gap = 12,
  margin = 12,
  minTop = margin,
}: {
  viewport: Size;
  card: Size;
  targets: Box[];
  obstacles?: Box[];
  gap?: number;
  margin?: number;
  /** Keeps the card below the top bar, which is drawn above it so its menus stay usable */
  minTop?: number;
}): { left: number; top: number } {
  const maxLeft = Math.max(margin, viewport.width - card.width - margin);
  const maxTop = Math.max(minTop, viewport.height - card.height - margin);
  const centre = {
    left: Math.max(margin, (viewport.width - card.width) / 2),
    top: Math.max(minTop, (viewport.height - card.height) / 2),
  };
  if (targets.length === 0) return centre;

  // Candidate positions: the viewport edges plus each edge of every box, inside and outside
  const boxes = [...targets, ...obstacles];
  const xs = new Set<number>([margin, maxLeft, centre.left]);
  const ys = new Set<number>([minTop, maxTop, centre.top]);
  const clampX = (v: number) => Math.min(maxLeft, Math.max(margin, v));
  const clampY = (v: number) => Math.min(maxTop, Math.max(minTop, v));
  for (const b of boxes) {
    for (const x of [b.left, right(b) - card.width, right(b) + gap, b.left - gap - card.width]) xs.add(clampX(x));
    for (const y of [b.top, bottom(b) - card.height, bottom(b) + gap, b.top - gap - card.height]) ys.add(clampY(y));
  }

  let best = centre;
  let bestScore = Infinity;
  for (const left of xs) {
    for (const top of ys) {
      const box = { left, top, width: card.width, height: card.height };
      const overTargets = targets.reduce((n, t) => n + overlapArea(box, grow(t, gap - 1)), 0);
      const overPanels = obstacles.reduce((n, o) => n + overlapArea(box, o), 0);
      const near = distance(box, targets[0]) + targets.slice(1).reduce((n, t) => n + distance(box, t) * 0.1, 0);
      // The small top / left terms make ties land high and close to the left edge of the target
      const score = overTargets * 1000 + overPanels * 100 + near + top * 0.01 + Math.abs(left - targets[0].left) * 0.005;
      if (score < bestScore) {
        bestScore = score;
        best = { left, top };
      }
    }
  }
  return best;
}

export interface SheetPosition {
  left: number;
  right: number;
  /** Exactly one of top / bottom is set */
  top?: number;
  bottom?: number;
}

/**
 * Tablet card: a sheet docked at the bottom. A tall panel being ringed at one side narrows the sheet; if a ring
 * would still be covered, the sheet moves to the top.
 */
export function placeSheet({
  viewport,
  height,
  targets,
  bottomInset,
  topInset,
  margin = 10,
  minWidth = 320,
}: {
  viewport: Size;
  height: number;
  targets: Box[];
  bottomInset: number;
  topInset: number;
  margin?: number;
  minWidth?: number;
}): SheetPosition {
  let left = margin;
  let rightEdge = margin;
  const sheet = (): Box => ({ left, top: viewport.height - bottomInset - height, width: viewport.width - left - rightEdge, height });

  for (const t of targets) {
    if (overlapArea(sheet(), t) === 0) continue;
    const afterIt = right(t) + margin;
    const beforeIt = viewport.width - t.left + margin;
    if (right(t) < viewport.width * 0.6 && viewport.width - afterIt - rightEdge >= minWidth) left = Math.max(left, afterIt);
    else if (t.left > viewport.width * 0.4 && viewport.width - left - beforeIt >= minWidth) rightEdge = Math.max(rightEdge, beforeIt);
  }

  if (targets.some((t) => overlapArea(sheet(), t) > 0)) {
    const atTop: Box = { ...sheet(), top: topInset };
    if (!targets.some((t) => overlapArea(atTop, t) > 0)) return { left, right: rightEdge, top: topInset };
  }
  return { left, right: rightEdge, bottom: bottomInset };
}
