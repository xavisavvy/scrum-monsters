import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const gamePanelVariants = cva(
  'jrpg-panel relative rounded-jrpg font-jrpg text-jrpg-text',
  {
    variants: {
      variant: {
        default: '',
        golden: 'bg-amber-950 border-amber-500',
        dark: 'bg-gray-950 border-gray-700',
      },
      size: {
        sm: 'p-jrpg-sm',
        md: 'p-jrpg-md',
        lg: 'p-jrpg-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

export interface GamePanelProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof gamePanelVariants> {
  title?: string;
}

export function GamePanel({
  className,
  variant,
  size,
  title,
  children,
  ...props
}: GamePanelProps) {
  return (
    <div className={cn(gamePanelVariants({ variant, size }), className)} {...props}>
      {title && <h3 className="jrpg-panel-title">{title}</h3>}
      {children}
    </div>
  );
}
