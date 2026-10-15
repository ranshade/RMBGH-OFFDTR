import { forwardRef } from 'react';
import { cn } from './utils';

export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-lg border border-input bg-card px-3 py-1 text-sm transition-colors',
        'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
});

export const Select = forwardRef(function Select({ className, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-lg border border-input bg-card px-3 py-1 text-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      {...props}
    />
  );
});

export const Label = ({ className, ...p }) => <label className={cn('block text-sm font-medium leading-none', className)} {...p} />;
