import { cn } from './utils';

const variants = {
  default: 'border-primary/20 bg-primary/10 text-primary',
  secondary: 'border-transparent bg-secondary text-muted-foreground',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  destructive: 'border-destructive/20 bg-destructive/10 text-destructive',
  outline: 'text-foreground',
};

export const Badge = ({ className, variant = 'default', ...p }) => (
  <span className={cn('inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold', variants[variant], className)} {...p} />
);
