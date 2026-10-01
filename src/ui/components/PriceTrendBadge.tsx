import React from 'react';
import { TrendingUp, TrendingDown, Minus, Award, Info } from 'lucide-react';
import { ProductPriceComparisonResult } from '../../domain/entities/PriceObservation.js';

export interface PriceTrendBadgeProps {
  readonly comparison: ProductPriceComparisonResult | null;
  readonly onClick?: () => void;
  readonly className?: string;
  readonly compact?: boolean;
}

export const PriceTrendBadge: React.FC<PriceTrendBadgeProps> = ({
  comparison,
  onClick,
  className = '',
  compact = false,
}) => {
  if (!comparison || !comparison.bestHistoricalObservation) {
    return null;
  }

  const { sameStoreDelta, isCurrentBest, bestHistoricalObservation, currentPrice } = comparison;

  type BadgeVariant = 'up' | 'down' | 'best' | 'equal' | 'first';
  let variant: BadgeVariant;
  let text: string;
  let ariaLabel: string;
  let IconComponent: React.FC<{ size?: number; className?: string }>;

  if (sameStoreDelta?.direction === 'UP') {
    variant = 'up';
    text = `▲ ${sameStoreDelta.formattedDiff}`;
    ariaLabel = `Precio ${sameStoreDelta.absoluteDiff.toFormattedString()} más caro que la última vez en este supermercado`;
    IconComponent = TrendingUp;
  } else if (sameStoreDelta?.direction === 'DOWN') {
    variant = 'down';
    text = `▼ ${sameStoreDelta.formattedDiff}`;
    ariaLabel = `Precio ${sameStoreDelta.absoluteDiff.toFormattedString()} más barato que la última vez en este supermercado`;
    IconComponent = TrendingDown;
  } else if (isCurrentBest && (!sameStoreDelta || sameStoreDelta.direction === 'EQUAL')) {
    variant = 'best';
    text = '★ Mejor precio';
    ariaLabel = `Mejor precio histórico registrado (${currentPrice.toFormattedString()})`;
    IconComponent = Award;
  } else if (sameStoreDelta?.direction === 'EQUAL') {
    variant = 'equal';
    text = '= Mismo precio';
    ariaLabel = `Mismo precio que la última vez en este supermercado (${currentPrice.toFormattedString()})`;
    IconComponent = Minus;
  } else if (sameStoreDelta === null) {
    variant = 'first';
    text = 'ℹ Primera vez';
    ariaLabel = `Primera vez en este supermercado. Precio más bajo en ${bestHistoricalObservation.storeName}: ${bestHistoricalObservation.price.toFormattedString()}`;
    IconComponent = Info;
  } else {
    return null;
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick();
    }
  };

  const badgeClasses = [
    'trend-badge',
    `trend-badge--${variant}`,
    compact ? 'trend-badge--compact' : '',
    onClick ? 'trend-badge--clickable' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      className={badgeClasses}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <IconComponent size={compact ? 12 : 14} className="trend-badge-icon" />
      <span className="trend-badge-text">{text}</span>
    </span>
  );
};
