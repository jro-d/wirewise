import React from 'react';
import {
  CanvasInputMode,
  useCanvasInputMode,
  useCanvasToolMode,
} from '../utils/canvasInputStorage';
import { isEditableEventTarget, matchesShortcutAction } from '../utils/shortcuts';

export interface Point {
  x: number;
  y: number;
}

export interface BoundsBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface UseCanvasNavigationOptions {
  /** Minimum / maximum zoom scale */
  minZoom?: number;
  maxZoom?: number;
  initialZoom?: number;
  /** Left inset in screen pixels (e.g. open floating library drawer) kept clear during Fit */
  insetLeft?: number;
  /** Allow 1-finger touch drag to pan directly (e.g. mobile view-only) */
  allowSingleTouchPan?: boolean;
  /** Optional bounds getter used by Fit view ('F' or Fit button) */
  getFitBounds?: () => BoundsBox | null;
  /** Changing this key triggers an automatic Fit after layout */
  fitKey?: string;
  /** Optional callback to mirror zoom updates (e.g. CAD status bar) */
  onZoomChange?: (zoom: number) => void;
  /** When false, ignores global canvas shortcuts like F / H / V / +/- / 0 */
  active?: boolean;
}

export interface WheelTransformInput {
  deltaX: number;
  deltaY: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  inputMode: CanvasInputMode;
  zoom: number;
  pan: Point;
  cursorLocal: Point;
  minZoom: number;
  maxZoom: number;
}

/** Pure wheel math: separates Trackpad 2-finger pan, Shift+Wheel horizontal pan, and pinch/mouse zoom. */
export function computeWheelNavigation(input: WheelTransformInput): { zoom: number; pan: Point } {
  const {
    deltaX,
    deltaY,
    ctrlKey,
    metaKey,
    shiftKey,
    inputMode,
    zoom,
    pan,
    cursorLocal,
    minZoom,
    maxZoom,
  } = input;

  // Pinch-to-zoom on trackpads fires wheel with ctrlKey=true; Ctrl+Wheel also zooms everywhere.
  const isPinchOrCtrlZoom = ctrlKey || metaKey;

  if (!isPinchOrCtrlZoom) {
    if (inputMode === 'trackpad') {
      return {
        zoom,
        pan: {
          x: pan.x - deltaX,
          y: pan.y - deltaY,
        },
      };
    }

    // Mouse mode: Shift+Wheel pans horizontally (for mice without a clickable scroll wheel / tilt wheel)
    if (shiftKey) {
      const horizDelta = Math.abs(deltaX) > 0 ? deltaX : deltaY;
      return {
        zoom,
        pan: {
          x: pan.x - horizDelta,
          y: pan.y,
        },
      };
    }

    // Pure horizontal wheel tilt/swipe with no vertical delta pans horizontally
    if (deltaX !== 0 && deltaY === 0) {
      return {
        zoom,
        pan: {
          x: pan.x - deltaX,
          y: pan.y,
        },
      };
    }
  }

  // Zoom anchored at cursorLocal
  const zoomFactor = isPinchOrCtrlZoom
    ? Math.exp(-deltaY * 0.008)
    : deltaY < 0
    ? 1.12
    : 0.89;
  const newZoom = Math.min(maxZoom, Math.max(minZoom, zoom * zoomFactor));
  if (newZoom === zoom) return { zoom, pan };

  const newPanX = cursorLocal.x - (cursorLocal.x - pan.x) * (newZoom / zoom);
  const newPanY = cursorLocal.y - (cursorLocal.y - pan.y) * (newZoom / zoom);
  return { zoom: newZoom, pan: { x: newPanX, y: newPanY } };
}

/** Pure 2-finger touch gesture math: pans with midpoint movement and pinch-zooms around midpoint. */
export function computePinchNavigation(params: {
  prevMid: Point;
  nextMid: Point;
  prevDist: number;
  nextDist: number;
  pan: Point;
  zoom: number;
  minZoom: number;
  maxZoom: number;
}): { zoom: number; pan: Point } {
  const { prevMid, nextMid, prevDist, nextDist, pan, zoom, minZoom, maxZoom } = params;
  const dx = nextMid.x - prevMid.x;
  const dy = nextMid.y - prevMid.y;

  let nextZoom = zoom;
  if (prevDist > 8 && nextDist > 8) {
    nextZoom = Math.min(maxZoom, Math.max(minZoom, zoom * (nextDist / prevDist)));
  }

  const shiftedX = pan.x + dx;
  const shiftedY = pan.y + dy;
  const ratio = nextZoom / zoom;
  return {
    zoom: nextZoom,
    pan: {
      x: nextMid.x - (nextMid.x - shiftedX) * ratio,
      y: nextMid.y - (nextMid.y - shiftedY) * ratio,
    },
  };
}

export function useCanvasNavigation({
  minZoom = 0.25,
  maxZoom = 2.5,
  initialZoom = 1.0,
  insetLeft = 0,
  allowSingleTouchPan = false,
  getFitBounds,
  fitKey,
  onZoomChange,
  active = true,
}: UseCanvasNavigationOptions) {
  const containerRef = React.useRef<SVGSVGElement | null>(null);
  const [zoom, setZoom] = React.useState(initialZoom);
  const [pan, setPan] = React.useState<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = React.useState(false);
  const [isSpacePressed, setIsSpacePressed] = React.useState(false);
  const [toolMode, setToolMode] = useCanvasToolMode();
  const [inputMode, setInputMode] = useCanvasInputMode();

  const panRef = React.useRef<Point>(pan);
  panRef.current = pan;
  const zoomRef = React.useRef<number>(zoom);
  zoomRef.current = zoom;
  const panOriginRef = React.useRef<Point | null>(null);

  const singleTouchRef = React.useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const pinchRef = React.useRef<{ mid: Point; dist: number } | null>(null);

  React.useEffect(() => {
    onZoomChange?.(zoom);
  }, [zoom, onZoomChange]);

  const zoomAt = React.useCallback(
    (nextZoomRaw: number, clientX?: number, clientY?: number) => {
      const el = containerRef.current;
      const curZoom = zoomRef.current;
      const curPan = panRef.current;
      const clamped = Math.min(maxZoom, Math.max(minZoom, nextZoomRaw));
      if (!el || clientX === undefined || clientY === undefined) {
        if (el) {
          const rect = el.getBoundingClientRect();
          const cx = rect.width / 2;
          const cy = rect.height / 2;
          setZoom(clamped);
          setPan({
            x: cx - (cx - curPan.x) * (clamped / curZoom),
            y: cy - (cy - curPan.y) * (clamped / curZoom),
          });
          return;
        }
        setZoom(clamped);
        return;
      }
      const rect = el.getBoundingClientRect();
      const lx = clientX - rect.left;
      const ly = clientY - rect.top;
      setZoom(clamped);
      setPan({
        x: lx - (lx - curPan.x) * (clamped / curZoom),
        y: ly - (ly - curPan.y) * (clamped / curZoom),
      });
    },
    [minZoom, maxZoom]
  );

  const zoomIn = React.useCallback(() => zoomAt(zoomRef.current + 0.15), [zoomAt]);
  const zoomOut = React.useCallback(() => zoomAt(zoomRef.current - 0.15), [zoomAt]);

  const resetView = React.useCallback(() => {
    setZoom(initialZoom);
    setPan({ x: 0, y: 0 });
  }, [initialZoom]);

  const fitToView = React.useCallback(() => {
    const el = containerRef.current;
    const bounds = getFitBounds?.();
    if (!el || !bounds) {
      resetView();
      return;
    }
    const rect = el.getBoundingClientRect();
    const pad = 56;
    const availW = Math.max(200, rect.width - insetLeft - pad * 2);
    const availH = Math.max(200, rect.height - pad * 2);
    const bw = Math.max(1, bounds.maxX - bounds.minX);
    const bh = Math.max(1, bounds.maxY - bounds.minY);
    const z = Math.min(1.15, Math.max(minZoom, Math.min(availW / bw, availH / bh)));
    setZoom(z);
    setPan({
      x: insetLeft + pad + (availW - bw * z) / 2 - bounds.minX * z,
      y: pad + (availH - bh * z) / 2 - bounds.minY * z,
    });
  }, [getFitBounds, insetLeft, minZoom, resetView]);

  React.useEffect(() => {
    if (fitKey === undefined) return;
    const t = window.setTimeout(fitToView, 30);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  // Block native browser wheel scrolling over the SVG so pinch & wheel stay locked to the canvas
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const block = (ev: WheelEvent) => ev.preventDefault();
    el.addEventListener('wheel', block, { passive: false });
    return () => el.removeEventListener('wheel', block);
  }, []);

  // Space hold-to-pan + customizable canvas navigation shortcuts
  React.useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableEventTarget(e.target)) return;
      if (e.code === 'Space') {
        setIsSpacePressed(true);
        return;
      }
      if (matchesShortcutAction(e, 'tool.select')) {
        e.preventDefault();
        setToolMode('select');
      } else if (matchesShortcutAction(e, 'tool.pan')) {
        e.preventDefault();
        setToolMode('pan');
      } else if (matchesShortcutAction(e, 'tool.toggleInputMode')) {
        e.preventDefault();
        setInputMode(inputMode === 'mouse' ? 'trackpad' : 'mouse');
      } else if (matchesShortcutAction(e, 'canvas.fit')) {
        e.preventDefault();
        fitToView();
      } else if (matchesShortcutAction(e, 'canvas.zoomIn')) {
        e.preventDefault();
        zoomIn();
      } else if (matchesShortcutAction(e, 'canvas.zoomOut')) {
        e.preventDefault();
        zoomOut();
      } else if (matchesShortcutAction(e, 'canvas.zoomReset')) {
        e.preventDefault();
        resetView();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpacePressed(false);
    };
    const onBlur = () => setIsSpacePressed(false);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [active, fitToView, inputMode, resetView, setInputMode, setToolMode, zoomIn, zoomOut]);

  const startPan = React.useCallback((clientX: number, clientY: number) => {
    setIsPanning(true);
    panOriginRef.current = {
      x: clientX - panRef.current.x,
      y: clientY - panRef.current.y,
    };
  }, []);

  const updatePan = React.useCallback((clientX: number, clientY: number) => {
    if (!panOriginRef.current) return false;
    setPan({
      x: clientX - panOriginRef.current.x,
      y: clientY - panOriginRef.current.y,
    });
    return true;
  }, []);

  const endPan = React.useCallback(() => {
    panOriginRef.current = null;
    setIsPanning(false);
  }, []);

  const shouldPanOnMouseDown = React.useCallback(
    (e: React.MouseEvent): boolean => {
      return (
        e.button === 1 ||
        e.button === 2 ||
        e.altKey ||
        isSpacePressed ||
        (e.button === 0 && toolMode === 'pan')
      );
    },
    [isSpacePressed, toolMode]
  );

  const handleWheel = React.useCallback(
    (e: React.WheelEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const res = computeWheelNavigation({
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        inputMode,
        zoom: zoomRef.current,
        pan: panRef.current,
        cursorLocal: { x: e.clientX - rect.left, y: e.clientY - rect.top },
        minZoom,
        maxZoom,
      });
      setZoom(res.zoom);
      setPan(res.pan);
    },
    [inputMode, maxZoom, minZoom]
  );

  const localTouchPoint = (touch: React.Touch, rect: DOMRect): Point => ({
    x: touch.clientX - rect.left,
    y: touch.clientY - rect.top,
  });

  const handleTouchStart = React.useCallback(
    (e: React.TouchEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (e.touches.length === 2) {
        const a = localTouchPoint(e.touches[0], rect);
        const b = localTouchPoint(e.touches[1], rect);
        singleTouchRef.current = null;
        pinchRef.current = {
          mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          dist: Math.hypot(b.x - a.x, b.y - a.y),
        };
      } else if (e.touches.length === 1 && (allowSingleTouchPan || toolMode === 'pan')) {
        const t = e.touches[0];
        pinchRef.current = null;
        singleTouchRef.current = { x: t.clientX, y: t.clientY, panX: panRef.current.x, panY: panRef.current.y };
      }
    },
    [allowSingleTouchPan, toolMode]
  );

  const handleTouchMove = React.useCallback(
    (e: React.TouchEvent) => {
      const el = containerRef.current;
      if (!el) return;
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const a = localTouchPoint(e.touches[0], rect);
        const b = localTouchPoint(e.touches[1], rect);
        const nextMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const nextDist = Math.hypot(b.x - a.x, b.y - a.y);
        const res = computePinchNavigation({
          prevMid: pinchRef.current.mid,
          nextMid,
          prevDist: pinchRef.current.dist,
          nextDist,
          pan: panRef.current,
          zoom: zoomRef.current,
          minZoom,
          maxZoom,
        });
        pinchRef.current = { mid: nextMid, dist: nextDist };
        setZoom(res.zoom);
        setPan(res.pan);
        return;
      }
      if (e.touches.length === 1 && singleTouchRef.current) {
        const t = e.touches[0];
        setPan({
          x: singleTouchRef.current.panX + (t.clientX - singleTouchRef.current.x),
          y: singleTouchRef.current.panY + (t.clientY - singleTouchRef.current.y),
        });
      }
    },
    [maxZoom, minZoom]
  );

  const handleTouchEnd = React.useCallback(() => {
    singleTouchRef.current = null;
    pinchRef.current = null;
  }, []);

  const panStep = React.useCallback((dx: number, dy: number) => {
    setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
  }, []);

  const toWorld = React.useCallback((clientX: number, clientY: number): Point => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: (clientX - rect.left - panRef.current.x) / zoomRef.current,
      y: (clientY - rect.top - panRef.current.y) / zoomRef.current,
    };
  }, []);

  const cursorClass =
    isPanning || (isSpacePressed && isPanning)
      ? 'cursor-grabbing'
      : isSpacePressed || toolMode === 'pan'
      ? 'cursor-grab'
      : 'cursor-default';

  return {
    containerRef,
    zoom,
    pan,
    setZoom,
    setPan,
    isPanning,
    isSpacePressed,
    toolMode,
    setToolMode,
    inputMode,
    setInputMode,
    cursorClass,
    shouldPanOnMouseDown,
    startPan,
    updatePan,
    endPan,
    panStep,
    zoomIn,
    zoomOut,
    zoomAt,
    resetView,
    fitToView,
    toWorld,
    handleWheel,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}
