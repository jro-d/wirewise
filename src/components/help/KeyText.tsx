import React from 'react';
import { useKeybinds } from '../../utils/shortcuts';
import { splitKeyText } from '../../utils/keyText';

export const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="inline-block rounded-xs border border-border-strong bg-surface-hover px-[5px] py-px font-mono text-[11px] font-normal leading-[1.4] text-ink whitespace-nowrap">
    {children}
  </kbd>
);

/** Guide copy with its {shortcut} tokens drawn as key chips (or as plain text with chips={false}). */
export const KeyText: React.FC<{ text: string; chips?: boolean }> = ({ text, chips = true }) => {
  const { getLabel } = useKeybinds();
  return (
    <>
      {splitKeyText(text, getLabel).map((part, i) =>
        part.key && chips ? <Kbd key={i}>{part.text}</Kbd> : <React.Fragment key={i}>{part.text}</React.Fragment>
      )}
    </>
  );
};
