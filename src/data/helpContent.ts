/**
 * The "How to Use WireWise" guide. Key names use the tokens described in utils/keyText.
 * Search looks at section titles and row labels.
 */
export type HelpSectionId = 'start' | 'controls' | 'wiring' | 'testing' | 'standards';

export interface HelpRow {
  label: string;
  text: string;
}

export interface HelpGroup {
  title?: string;
  rows: HelpRow[];
}

export interface HelpSection {
  id: HelpSectionId;
  title: string;
  /** Chip label in the tablet drawer */
  short: string;
  lead?: string;
  groups: HelpGroup[];
  /** Tag shown next to the title in the phone view */
  phoneTag?: string;
}

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: 'start',
    title: 'Getting started',
    short: 'Start',
    lead: 'WireWise has two modes. You build in Edit Mode and test in Live Simulation Mode, and you can switch back at any time.',
    groups: [
      {
        title: 'Modes',
        rows: [
          { label: 'Edit Mode', text: 'Place devices, draw conductors and set ratings. Nothing is energized.' },
          { label: 'Live Simulation Mode', text: 'Press Simulate. Breakers trip, lamps light and meters read. Stop Sim returns you to editing.' },
        ],
      },
      {
        title: 'The five-minute flow',
        rows: [
          { label: 'Choose a standard', text: 'Choose PEC 2017 or IEC 60364 in the overflow menu.' },
          { label: 'Place devices', text: 'Place devices from the Library {panel.library} or open an example lab.' },
          { label: 'Wire them', text: 'Pick a conductor and click terminal to terminal.' },
          { label: 'Check the code', text: 'Read the Code Inspector {panel.inspector} before you energize.' },
          { label: 'Simulate and measure', text: 'Press Simulate {sim.toggle} and measure with the DMM {panel.dmm}.' },
        ],
      },
    ],
  },
  {
    id: 'controls',
    title: 'Controls and navigation',
    short: 'Controls',
    phoneTag: 'Touch',
    lead: 'Pick the input style that matches your hardware. {tool.toggleInputMode} switches Mouse and Trackpad at any time.',
    groups: [
      {
        title: 'Two-button mouse',
        rows: [
          { label: 'Pan tool', text: 'Press {tool.pan}, then drag. {tool.select} returns to Select.' },
          { label: 'Quick pan', text: 'Hold {=Space} and drag, or {=Shift} + Wheel.' },
          { label: 'Zoom', text: 'Wheel, the − and + buttons, {canvas.fit} to fit, {canvas.zoomReset} for 1:1.' },
        ],
      },
      {
        title: 'Laptop trackpad',
        rows: [{ label: 'Pan and zoom', text: 'In Trackpad mode, two-finger drag pans. Pinch zooms toward the cursor.' }],
      },
      {
        title: 'Touch',
        rows: [{ label: 'Tablet gestures', text: 'Drag with one finger in the Pan tool, pinch to zoom, tap to select, double-tap to inspect.' }],
      },
      {
        title: 'Sound',
        rows: [{ label: 'Sound effects', text: '{sound.toggle} turns sound effects on or off. The overflow menu and the speaker button in the status bar do the same.' }],
      },
    ],
  },
  {
    id: 'wiring',
    title: 'Wiring and editing',
    short: 'Wiring',
    phoneTag: 'Tablet and up',
    lead: 'Wires are drawn terminal to terminal and stay orthogonal, so the drawing reads like a real panel.',
    groups: [
      {
        rows: [
          { label: 'Terminals', text: 'Click one terminal, then another. {edit.deselect} cancels the wire in progress.' },
          { label: 'Wire segments', text: 'Drag a segment to move it. Corners follow at right angles.' },
          { label: 'Port context menu', text: 'Right-click a wired terminal to rewire or disconnect it. Double-click a wire to change its conductor.' },
          { label: 'Multi-select', text: 'Drag a marquee, or hold {=Shift} and click. Move or delete the group together.' },
          { label: 'DIN-rail snapping', text: 'Drag a modular device close to a rail and it snaps on. Devices also line up on their centres.' },
          { label: 'Edit a device', text: '{edit.rotate} rotate · {edit.lock} lock · {edit.inspect} inspector · arrow keys nudge.' },
          { label: 'Save and open', text: 'File, then Save project, writes a .wirewise file. Open project reads .wirewise and older .json files.' },
        ],
      },
    ],
  },
  {
    id: 'testing',
    title: 'Testing and analysis',
    short: 'Testing',
    lead: 'Measure first, then change one thing at a time. That is how you find a fault in a real board too.',
    groups: [
      {
        rows: [
          { label: 'Instruments', text: 'DMM {panel.dmm}, clamp meter, megger, earth tester, rotation meter, continuity tester.' },
          { label: 'Troubleshoot mode', text: 'Hides the answer and lets you inject and find faults with your meters.' },
          { label: 'Ladder', text: 'Control logic between two rails, with live contact states.' },
          { label: 'SLD / Schematic', text: 'Single-line view of supply, protection and loads.' },
          { label: 'PLC', text: 'The PLC program, with its inputs and outputs.' },
          { label: 'Floor Plan', text: 'Draw rooms, place linked symbols and set wire lengths from home runs.' },
          { label: 'Reports', text: 'Load schedule, bill of materials, wire numbers, energy, graded labs, safe isolation and share links.' },
        ],
      },
    ],
  },
  {
    id: 'standards',
    title: 'Code standards notice',
    short: 'Standards',
    lead: 'Before you build or energize a real installation, work from the current code, a qualified designer and a licensed electrician. Clause numbers shown in the Code Inspector point you to where to read more.',
    groups: [{ rows: [{ label: 'Supported standards', text: 'PEC 2017 (60 Hz, AWG) · IEC 60364 (50 Hz, mm²)' }] }],
  },
];

export const STANDARDS_NOTICE =
  'WireWise teaches the ideas behind PEC 2017 and IEC 60364. Its checks are simplified and are not a substitute for the adopted code, local amendments, or the authority having jurisdiction.';

/** Sections reduced to the rows matching the query. A matching section title keeps all of its rows. */
export function searchHelp(query: string, sections: HelpSection[] = HELP_SECTIONS): HelpSection[] {
  const q = query.trim().toLowerCase();
  if (!q) return sections;
  const hits: HelpSection[] = [];
  for (const section of sections) {
    if (section.title.toLowerCase().includes(q)) {
      hits.push(section);
      continue;
    }
    const groups = section.groups
      .map((g) => ({ ...g, rows: g.rows.filter((r) => r.label.toLowerCase().includes(q)) }))
      .filter((g) => g.rows.length > 0);
    if (groups.length > 0) hits.push({ ...section, groups });
  }
  return hits;
}
