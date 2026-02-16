import { MasteryTier } from '@shared/classMasteryTypes';

interface MasteryBadgeProps {
  tier: MasteryTier;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * MasteryBadge displays a class mastery tier with JRPG-themed visual styling.
 * - Novice: Gray badge (subtle, progressive disclosure)
 * - Expert: Amber/gold badge with subtle glow
 * - Master: Gold gradient badge with beveled edge effect
 */
export function MasteryBadge({ tier, size = 'md', className = '' }: MasteryBadgeProps) {
  // Size variants
  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  // Tier-specific styling
  const tierStyles = {
    Novice: {
      text: 'text-gray-400',
      bg: 'bg-gray-800/50',
      border: 'border border-gray-600',
      extra: '',
    },
    Expert: {
      text: 'text-amber-400',
      bg: 'bg-amber-900/30',
      border: 'border border-amber-500',
      extra: 'shadow-amber-500/20 shadow-sm',
    },
    Master: {
      text: 'text-yellow-300',
      bg: 'bg-gradient-to-r from-amber-600 to-yellow-500',
      border: 'border border-yellow-400',
      extra: 'shadow-yellow-400/30 shadow-md',
    },
  };

  const style = tierStyles[tier];
  const sizeClass = sizeClasses[size];

  return (
    <span
      className={`inline-flex items-center justify-center rounded font-bold uppercase tracking-wide ${style.text} ${style.bg} ${style.border} ${style.extra} ${sizeClass} ${className}`}
    >
      {tier}
    </span>
  );
}
