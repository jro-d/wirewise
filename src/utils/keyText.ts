/**
 * Guide copy with key names in it. "{tool.pan}" shows the key currently bound to that shortcut, so the
 * Help panel and walkthrough stay right after a rebind. "{=Space}" is a fixed key or mouse gesture.
 */
import type { ShortcutActionId } from './shortcuts';

export interface KeyTextPart {
  text: string;
  /** Drawn as a key chip */
  key: boolean;
}

export function splitKeyText(template: string, labelFor: (id: ShortcutActionId) => string): KeyTextPart[] {
  return template
    .split(/(\{[^}]+\})/)
    .filter(Boolean)
    .map((chunk) => {
      if (!chunk.startsWith('{') || !chunk.endsWith('}')) return { text: chunk, key: false };
      const token = chunk.slice(1, -1);
      return { text: token.startsWith('=') ? token.slice(1) : labelFor(token as ShortcutActionId), key: true };
    });
}

export function plainKeyText(template: string, labelFor: (id: ShortcutActionId) => string): string {
  return splitKeyText(template, labelFor)
    .map((p) => p.text)
    .join('');
}

/** Every shortcut id a template refers to (used by tests to catch typos). */
export function shortcutTokens(template: string): string[] {
  return Array.from(template.matchAll(/\{([^=}][^}]*)\}/g), (m) => m[1]);
}
