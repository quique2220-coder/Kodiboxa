import type { SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function NativeSelect({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...p} className={cn('h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40', className)}>
      {children}
    </select>
  );
}
