import type { CSSProperties, ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { clubVars } from './clubInk';
import './arcade.css';

/**
 * Marquee: a section header board. A gold flag on the left, a Silkscreen kicker, the Barlow Condensed title, a row of
 * blinking bulbs along the bottom and an optional slot on the right (a toggle, a stepper, a count).
 * Props: title, kicker?, right?, club? (a club name: its flat colour replaces the navy board), as? (heading tag, h2),
 * className?. Bulbs blink only with motion allowed and never in lite mode.
 */
export interface MarqueeProps {
  title: ReactNode;
  kicker?: ReactNode;
  right?: ReactNode;
  club?: string | null;
  as?: ElementType;
  className?: string;
}
export const Marquee = ({ title, kicker, right, club, as: Tag = 'h2', className }: MarqueeProps) => (
  <header className={cn('ax-marquee', club && 'ax-marquee--club', className)} style={club ? (clubVars(club) as CSSProperties) : undefined}>
    <span className="ax-marquee__flag" aria-hidden="true" />
    <div className="ax-marquee__text">
      {kicker && <span className="ax-kicker">{kicker}</span>}
      <Tag className="ax-marquee__title">{title}</Tag>
    </div>
    {right && <div className="ax-marquee__right">{right}</div>}
    <span className="ax-marquee__bulbs" aria-hidden="true" />
  </header>
);
export default Marquee;
