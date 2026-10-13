import { forwardRef } from 'react';
import { cn } from './utils';

const variants = {
  default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
  outline: 'border border-input bg-card shadow-sm hover:bg-accent hover:text-accent-foreground',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
  link: 'text-primary underline-offset-4 hover:underline',
};
const sizes = {
  default: 'h-9 px-4 py-2',
  sm: 'h-8 rounded-md px-3 text-xs',
  lg: 'h-12 rounded-lg px-8 text-base',
  icon: 'h-9 w-9',
};

export const Button = forwardRef(function Button({ className, variant = 'default', size = 'default', type = 'button', ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        variants[variant], sizes[size], className,
      )}
      {...props}
    />
  );
});
