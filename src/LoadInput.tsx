import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import type { EquipmentPreset } from './domain/types';
import { formatWeight } from './domain/weight-format';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
 value: number;
 onChange: (value: number) => void;
 preset?: EquipmentPreset;
 observed?: boolean;
 emptyZero?: boolean;
};

/** Format snapshots and committed fields without rewriting what a person is typing. */
export function LoadInput({ value, onChange, preset, observed, emptyZero = false, onBlur, ...props }: Props) {
 const textFor = (next: number) => emptyZero && next === 0 ? '' : formatWeight(next, { preset, observed });
 const [text, setText] = useState(() => textFor(value));
 const previous = useRef({ value, preset, observed });
 useEffect(() => {
  const before = previous.current;
  if (value !== before.value || preset !== before.preset || observed !== before.observed) setText(textFor(value));
  previous.current = { value, preset, observed };
 }, [value, preset, observed, emptyZero]);
 return <input {...props} type="number" inputMode="decimal" value={text} onChange={event => {
  const nextText = event.target.value;
  const next = Number(nextText);
  setText(nextText);
  // Remember our own update so the next render preserves trailing decimals and the caret.
  previous.current = { value: next, preset, observed };
  onChange(next);
 }} onBlur={event => {
  if (Number.isFinite(value)) setText(textFor(value));
  onBlur?.(event);
 }}/>
}
