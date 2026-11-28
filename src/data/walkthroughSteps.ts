/**
 * The six-step first-run walkthrough. Each ring lists selectors in order of preference; the first one that is
 * on screen is ringed. Targets are marked with data-tour attributes in the app.
 */
import type { ShortcutActionId } from '../utils/shortcuts';

export type TourAction = 'open-library' | 'open-inspector' | 'show-realistic';

export interface WalkthroughStep {
  title: string;
  body: string;
  /** Key chips under the body (at most five), as keyText tokens */
  keys: string[];
  rings: string[][];
  /** A panel this step points at. When it is closed the card says so and offers to open it. */
  panel?: {
    selector: string;
    toggle: string;
    message: string;
    action: TourAction;
    actionLabel: string;
    actionKey: ShortcutActionId;
  };
  /** The step points at a device on the workbench */
  needsDevice?: boolean;
}

const tour = (name: string) => `[data-tour="${name}"]`;

export const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    title: 'Pick your code standard and canvas controls',
    body: 'Open the overflow menu and choose PEC 2017 (60 Hz, AWG) or IEC 60364 (50 Hz, mm²); colours and checks follow your choice. Pan with {tool.pan}, {=Space + drag} or {=Shift + Wheel}. {tool.toggleInputMode} switches Mouse and Trackpad, and {canvas.fit} fits the drawing.',
    keys: ['{tool.pan}', '{=Space + drag}', '{=Shift + Wheel}', '{tool.toggleInputMode}', '{canvas.fit}'],
    rings: [[tour('overflow-menu')], [tour('canvas-hud')]],
  },
  {
    title: 'Place devices or open an example lab',
    body: 'Press {panel.library} to open the Library and drag devices onto the canvas. Not sure where to begin? Examples & learning labs open a finished circuit you can study, change and run.',
    keys: ['{panel.library}'],
    rings: [[tour('library-drawer')], [tour('examples'), tour('file-menu')]],
    panel: {
      selector: tour('library-drawer'),
      toggle: tour('library-toggle'),
      message: 'The Library is closed right now.',
      action: 'open-library',
      actionLabel: 'Open Library',
      actionKey: 'panel.library',
    },
  },
  {
    title: 'Choose a conductor, then wire terminals',
    body: 'Pick a colour and gauge in the Conductor dock, then click one terminal and another to connect them. Press {edit.deselect} to cancel a wire in progress. Click any wire later to adjust it or rewire an end.',
    keys: ['{edit.deselect}'],
    rings: [[tour('conductor-dock')]],
  },
  {
    title: 'Inspect and set device ratings',
    body: 'Double-click a device, or select it and press {edit.inspect}, to open the inspector and set its ratings. {edit.rotate} rotates, {edit.lock} locks it in place, and the arrow keys nudge it one grid step.',
    keys: ['{edit.inspect}', '{edit.rotate}', '{edit.lock}', '{=Arrow keys}'],
    rings: [],
    needsDevice: true,
  },
  {
    title: 'Check the Code Inspector before you energize',
    body: 'The Code Inspector lists what breaks the code before power goes on, and the Status chip sums it up. Click a finding and WireWise highlights the device or wire involved. Clear the errors first.',
    keys: ['{panel.inspector}'],
    rings: [[tour('inspector')], [tour('status-chip')]],
    panel: {
      selector: tour('inspector'),
      toggle: tour('inspector-toggle'),
      message: 'The Code Inspector is closed right now.',
      action: 'open-inspector',
      actionLabel: 'Open Code Inspector',
      actionKey: 'panel.inspector',
    },
  },
  {
    title: 'Simulate, measure and switch views',
    body: 'Press Simulate to energize the circuit and Stop Sim to return to editing. Switch between Realistic, Split, Ladder, Schematic, PLC and Plan to see the same circuit another way. Press {panel.dmm} for the DMM, or open Reports when you want a record.',
    keys: ['{sim.toggle}', '{panel.dmm}'],
    rings: [[tour('simulate')], [tour('view-switcher')]],
  },
];
