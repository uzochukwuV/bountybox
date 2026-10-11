import React from 'react';
import { cn } from '@/lib/utils';

const TONES = [
  'bg-tone-violet-soft text-tone-violet',
  'bg-tone-blue-soft text-tone-blue',
  'bg-tone-green-soft text-tone-green',
  'bg-tone-amber-soft text-tone-amber',
  'bg-tone-red-soft text-tone-red',
  'bg-tone-slate-soft text-tone-slate',
];

const SIZES = {
  xs: 'h-5 w-5 text-[10px]',
  sm: 'h-7 w-7 text-[11px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-11 w-11 text-sm',
};

function hash(value) {
  let total = 0;
  for (let i = 0; i < value.length; i += 1) total = (total * 31 + value.charCodeAt(i)) % 9973;
  return total;
}

export default function InitialsAvatar({ name = '', size = 'sm', className }) {
  const label = name.trim() || '?';
  const initials =
    label
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || '?';

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        SIZES[size],
        TONES[hash(label) % TONES.length],
        className
      )}
    >
      {initials}
    </span>
  );
}