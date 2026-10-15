import { cn } from './utils';

export const Card = ({ className, ...p }) => (
  <div className={cn('rounded-xl border bg-card text-card-foreground', className)} {...p} />
);
// `row` lays the header out horizontally (title on the left, actions on the right).
// `tight` removes the bottom padding (used for stat cards).
export const CardHeader = ({ className, row, tight, ...p }) => (
  <div
    className={cn(
      row ? 'flex flex-row flex-wrap items-center justify-between gap-3 p-6' : 'flex flex-col space-y-1.5 p-6',
      tight && 'pb-2',
      className,
    )}
    {...p}
  />
);
export const CardTitle = ({ className, ...p }) => <h3 className={cn('font-semibold leading-none tracking-tight', className)} {...p} />;
export const CardDescription = ({ className, ...p }) => <p className={cn('text-sm text-muted-foreground', className)} {...p} />;
export const CardContent = ({ className, ...p }) => <div className={cn('p-6 pt-0', className)} {...p} />;
export const CardFooter = ({ className, ...p }) => <div className={cn('flex items-center p-6 pt-0', className)} {...p} />;
