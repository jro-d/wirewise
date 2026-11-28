/**
 * Release notes shown by "What's New" and Help > Update Logs. Bundled with the app so they work offline.
 * Newest first. The top entry must match the version in package.json (a test checks this).
 * Keep at most five bullets per category: a bold lead, then one sentence.
 */
export type ChangeKind = 'new' | 'improved' | 'fixed';

export const CHANGE_KINDS: ChangeKind[] = ['new', 'improved', 'fixed'];

export const CHANGE_KIND_LABEL: Record<ChangeKind, string> = { new: 'New', improved: 'Improved', fixed: 'Fixed' };

export const MAX_BULLETS_PER_KIND = 5;

export interface ChangeBullet {
  lead: string;
  text: string;
}

export interface Release {
  version: string;
  /** ISO date (YYYY-MM-DD). null until the release is tagged. */
  date: string | null;
  /** One line shown while the release is collapsed */
  summary: string;
  changes: Partial<Record<ChangeKind, ChangeBullet[]>>;
}

export const RELEASES: Release[] = [
  {
    version: '1.1.0',
    date: null,
    summary: 'Guided walkthrough, Help panel, easier canvas navigation and clearer diagrams.',
    changes: {
      new: [
        { lead: 'New Installation Guide.', text: 'Six short steps that start on your first launch.' },
        { lead: 'How to Use panel.', text: 'Controls, wiring and test views in one place, from the Help button.' },
        { lead: 'Update Logs.', text: 'Read what changed in every release from the Help menu.' },
        { lead: 'Pan tool and Trackpad mode.', text: 'Move around every canvas without a clickable scroll wheel.' },
        { lead: 'Keyboard shortcuts editor.', text: 'See and rebind the keys for tools, views and editing.' },
      ],
      improved: [
        { lead: 'Control ladder.', text: 'A vertical IEC layout with shared trunks, path numbers and contact cross-references.' },
        { lead: 'Single-line diagram.', text: 'Supply, protection and loads are drawn in clear tiers.' },
        { lead: 'PLC view.', text: 'A monitor strip shows the inputs and outputs while the program runs.' },
        { lead: 'Windows menu.', text: 'Help has the same guide and release notes as the app.' },
      ],
      fixed: [
        { lead: 'Standard menu.', text: 'IEC 60364 is always listed at 50 Hz.' },
        { lead: 'Download page on phones.', text: 'Open in browser is hidden where the editor is not available.' },
      ],
    },
  },
  {
    version: '1.0.2',
    date: '2026-11-22',
    summary: 'A much smaller Windows app and a new download page.',
    changes: {
      new: [{ lead: 'Download page.', text: 'The website offers the installer, the portable file and the browser app.' }],
      improved: [
        { lead: 'Windows app.', text: 'Rebuilt on Tauri, so the download is far smaller.' },
        { lead: 'Logo.', text: 'WireWise has a new mark in the app and on the website.' },
      ],
      fixed: [{ lead: 'Cached logo.', text: 'Browsers no longer keep showing the old icon.' }],
    },
  },
  {
    version: '1.0.1',
    date: '2026-11-21',
    summary: 'Smarter search, device details and roomier example labs.',
    changes: {
      new: [
        { lead: 'Lab search.', text: 'Find an example wiring by title, objective or device name.' },
        { lead: 'Component details.', text: 'The info button in the Library opens ratings and terminals.' },
      ],
      improved: [
        { lead: 'Library search.', text: 'It understands short forms, synonyms and small typos.' },
        { lead: 'Example labs.', text: 'Wider layouts with straighter wires.' },
      ],
    },
  },
  {
    version: '1.0.0',
    date: '2026-11-20',
    summary: 'First Windows release.',
    changes: {
      new: [
        { lead: 'WireWise for Windows.', text: 'The simulator runs as a desktop app and checks for newer versions.' },
      ],
    },
  },
];
