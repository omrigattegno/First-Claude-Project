import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './Button.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'm' | 'l' | 'xl';
  block?: boolean;
  children: ReactNode;
}

/** Shared button. Tap target is at least 48px; `size="xl"` is the big full-width table action. */
export function Button({ variant = 'secondary', size = 'm', block = false, className = '', ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`btn btn--${variant} btn--${size} ${block ? 'btn--block' : ''} ${className}`.trim()}
    />
  );
}
