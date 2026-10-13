import { cn } from './utils';

// Segmented control styled like shadcn Tabs.
export function Tabs({ value, onChange, items, className }) {
  return (
    <div role="tablist" className={cn('inline-flex h-9 items-center rounded-lg bg-muted p-1 text-muted-foreground', className)}>
      {items.map(([k, label]) => (
        <button
          key={k}
          role="tab"
          aria-selected={value === k}
          onClick={() => onChange(k)}
          className={cn(
            'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === k ? 'bg-card text-foreground shadow' : 'hover:text-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
