import { cn } from '@/lib/utils';

type HealthBarSize = 'sm' | 'md' | 'lg';

interface HealthBarProps {
  value: number;
  max: number;
  label?: string;
  showValue?: boolean;
  size?: HealthBarSize;
  className?: string;
  animated?: boolean;
}

const SIZE_CLASSES: Record<HealthBarSize, string> = {
  sm: 'h-3',
  md: 'h-5',
  lg: 'h-7',
};

function getHealthColor(pct: number): string {
  if (pct > 50) return 'var(--jrpg-health-high)';
  if (pct > 25) return 'var(--jrpg-health-mid)';
  return 'var(--jrpg-health-low)';
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function HealthBar({
  value,
  max,
  label,
  showValue = false,
  size = 'md',
  className,
  animated = true,
}: HealthBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const fillColor = getHealthColor(pct);
  const trackHeight = SIZE_CLASSES[size];
  const isLowHP = pct <= 25;
  const canShowText = size !== 'sm';

  const shouldPulse = animated && isLowHP && !prefersReducedMotion();

  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label ?? 'Health'}
      className={cn(
        'relative w-full overflow-hidden rounded-jrpg border border-jrpg-panel-border bg-jrpg-panel',
        trackHeight,
        className
      )}
    >
      <div
        style={{
          width: `${pct}%`,
          backgroundColor: fillColor,
          transition: 'width 0.5s ease-out, background-color 0.3s ease',
        }}
        className={cn('h-full', shouldPulse && 'animate-pulse')}
      />
      {showValue && canShowText && (
        <span className="absolute inset-0 flex items-center justify-center text-xs font-jrpg text-jrpg-text">
          {value}/{max} HP
        </span>
      )}
    </div>
  );
}
