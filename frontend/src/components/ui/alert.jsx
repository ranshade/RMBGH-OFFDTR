import { cn } from './utils';

export const Alert = ({ variant = 'default', className, ...p }) => (
  <div
    role={variant === 'destructive' ? 'alert' : 'status'}
    className={cn(
      'rounded-lg border px-4 py-3 text-sm',
      variant === 'destructive' ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-primary/20 bg-primary/10 text-accent-foreground',
      className,
    )}
    {...p}
  />
);
