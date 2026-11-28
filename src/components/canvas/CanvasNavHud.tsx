import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Hand,
  Laptop,
  Maximize2,
  Minus,
  Mouse,
  MousePointer2,
  Plus,
  RotateCcw,
} from 'lucide-react';
import type { CanvasInputMode, CanvasToolMode } from '../../utils/canvasInputStorage';
import { useKeybinds } from '../../utils/shortcuts';

export interface CanvasNavHudProps {
  zoom: number;
  toolMode: CanvasToolMode;
  onToolModeChange: (mode: CanvasToolMode) => void;
  inputMode: CanvasInputMode;
  onInputModeChange: (mode: CanvasInputMode) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onPanStep?: (dx: number, dy: number) => void;
  onFit?: () => void;
  onReset: () => void;
  /** Optional extra positioning classes (defaults to top-4 right-4) */
  className?: string;
}

const PAN_STEP_PX = 140;

export const CanvasNavHud: React.FC<CanvasNavHudProps> = ({
  zoom,
  toolMode,
  onToolModeChange,
  inputMode,
  onInputModeChange,
  onZoomIn,
  onZoomOut,
  onPanStep,
  onFit,
  onReset,
  className = 'top-3 right-3',
}) => {
  const { getLabel } = useKeybinds();
  const selectKey = getLabel('tool.select');
  const panKey = getLabel('tool.pan');
  const modeKey = getLabel('tool.toggleInputMode');
  const fitKey = getLabel('canvas.fit');
  const zoomInKey = getLabel('canvas.zoomIn');
  const zoomOutKey = getLabel('canvas.zoomOut');
  const resetKey = getLabel('canvas.zoomReset');

  const btnBase =
    'h-7 flex items-center justify-center rounded-sm text-xs font-medium transition motion-reduce:transition-none focus-visible:outline-none focus-visible:shadow-focus';

  return (
    <div
      role="toolbar"
      aria-label="Canvas navigation controls"
      onMouseDown={(e) => e.stopPropagation()}
      className={`absolute ${className} z-20 flex flex-wrap items-center gap-1 bg-surface/95 border border-border rounded-md p-1 shadow-2 backdrop-blur-md select-none`}
    >
      {/* Select vs Pan tool */}
      <div className="flex items-center bg-surface-sunken border border-border/70 rounded-sm p-0.5 gap-0.5">
        <button
          type="button"
          onClick={() => onToolModeChange('select')}
          aria-pressed={toolMode === 'select'}
          title={`Select / edit tool (${selectKey})`}
          className={`${btnBase} w-7 ${
            toolMode === 'select'
              ? 'bg-probe text-on-probe shadow-1'
              : 'text-ink-muted hover:text-ink hover:bg-surface-hover'
          }`}
        >
          <MousePointer2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onToolModeChange('pan')}
          aria-pressed={toolMode === 'pan'}
          title={`Pan tool — left-click drag to pan (${panKey})`}
          className={`${btnBase} px-1.5 gap-1 ${
            toolMode === 'pan'
              ? 'bg-probe text-on-probe shadow-1'
              : 'text-ink-muted hover:text-ink hover:bg-surface-hover'
          }`}
        >
          <Hand className="w-3.5 h-3.5" />
          <span className="hidden sm:inline text-[11px] font-semibold">Pan</span>
        </button>
      </div>

      {/* Horizontal quick pan step buttons for mice without clickable scroll wheels */}
      {onPanStep && (
        <div className="flex items-center bg-surface-sunken border border-border/70 rounded-sm p-0.5 gap-0.5">
          <button
            type="button"
            onClick={() => onPanStep(PAN_STEP_PX, 0)}
            title="Pan canvas left (or Shift+Wheel)"
            aria-label="Pan canvas left"
            className={`${btnBase} w-6 text-ink-muted hover:text-ink hover:bg-surface-hover`}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onPanStep(-PAN_STEP_PX, 0)}
            title="Pan canvas right (or Shift+Wheel)"
            aria-label="Pan canvas right"
            className={`${btnBase} w-6 text-ink-muted hover:text-ink hover:bg-surface-hover`}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Mouse vs Trackpad input mode */}
      <button
        type="button"
        onClick={() => onInputModeChange(inputMode === 'mouse' ? 'trackpad' : 'mouse')}
        aria-pressed={inputMode === 'trackpad'}
        title={
          inputMode === 'trackpad'
            ? `Trackpad mode active: two-finger swipe pans, pinch zooms (${modeKey})`
            : `Mouse mode active: scroll zooms, Shift+scroll pans left/right. Click for Trackpad mode (${modeKey})`
        }
        className={`${btnBase} px-2 gap-1 border ${
          inputMode === 'trackpad'
            ? 'bg-probe text-on-probe border-probe shadow-1'
            : 'bg-surface-sunken border-border/70 text-ink hover:bg-surface-hover'
        }`}
      >
        {inputMode === 'trackpad' ? (
          <Laptop className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <Mouse className="w-3.5 h-3.5 shrink-0" />
        )}
        <span className="hidden md:inline text-[11px] font-semibold">
          {inputMode === 'trackpad' ? 'Trackpad' : 'Mouse'}
        </span>
      </button>

      <div className="w-px h-5 bg-border mx-0.5" />

      {/* Zoom controls */}
      <button
        type="button"
        onClick={onZoomOut}
        title={`Zoom out (${zoomOutKey})`}
        aria-label="Zoom out"
        className={`${btnBase} w-7 bg-surface-sunken hover:bg-surface-hover border border-border/70 text-ink`}
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <span className="text-[11px] font-mono text-ink-muted w-11 text-center font-semibold tabular-nums">
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        onClick={onZoomIn}
        title={`Zoom in (${zoomInKey})`}
        aria-label="Zoom in"
        className={`${btnBase} w-7 bg-surface-sunken hover:bg-surface-hover border border-border/70 text-ink`}
      >
        <Plus className="w-3.5 h-3.5" />
      </button>

      {onFit && (
        <button
          type="button"
          onClick={onFit}
          title={`Fit drawing to view (${fitKey})`}
          className={`${btnBase} px-2 gap-1 bg-ink hover:opacity-90 text-surface font-semibold text-[11px]`}
        >
          <Maximize2 className="w-3 h-3" />
          <span>Fit</span>
        </button>
      )}

      <button
        type="button"
        onClick={onReset}
        title={`Reset view to 100% (${resetKey})`}
        className={`${btnBase} px-2 gap-1 bg-surface-sunken hover:bg-surface-hover border border-border/70 text-ink-muted hover:text-ink font-mono text-[11px]`}
      >
        <RotateCcw className="w-3 h-3" />
        <span>1:1</span>
      </button>
    </div>
  );
};
