import { cn } from '@/lib/utils';

type StatBarVariant = 'health' | 'xp' | 'mana' | 'timer';
type StatBarSize = 'sm' | 'md' | 'lg';

interface StatBarProps {
  value: number;
  max?: number;
  variant?: StatBarVariant;
  label?: string;
  showValue?: boolean;
  size?: StatBarSize;
  className?: string;
  color?: string;
}

const VARIANT_COLORS: Record<StatBarVariant, string> = {
  health: 'var(--jrpg-health-high)',
  xp: 'var(--jrpg-xp-fill)',
  mana: 'var(--jrpg-mana-fill)',
  timer: '#f59e0b', // amber-400
};

const SIZE_CLASSES: Record<StatBarSize, string> = {
  sm: 'h-3',
  md: 'h-5',
  lg: 'h-7',
};

export function StatBar({
  value,
  max,
  variant = 'health',
  label,
  showValue = false,
  size = 'md',
  className,
  color,
}: StatBarProps) {
  const effectiveMax = max ?? 100;
  const pct = Math.max(0, Math.min(100, (value / effectiveMax) * 100));
  const fillColor = color ?? VARIANT_COLORS[variant];
  const trackHeight = SIZE_CLASSES[size];
  const canShowText = size !== 'sm';

  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={effectiveMax}
      aria-label={label ?? variant}
      className={cn('relative w-full overflow-hidden rounded-jrpg border border-jrpg-panel-border bg-jrpg-panel', trackHeight, className)}
    >
      <div
        style={{
          width: `${pct}%`,
          backgroundColor: fillColor,
          transition: 'width 0.5s ease-out',
        }}
        className="h-full"
      />
      {showValue && canShowText && (
        <span className="absolute inset-0 flex items-center justify-center text-xs font-jrpg text-jrpg-text">
          {max != null ? `${value}/${effectiveMax}` : `${Math.round(pct)}%`}
        </span>
      )}
    </div>
  );
}
