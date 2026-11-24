import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import TeamLogo from '../brand/TeamLogo';
import './arcade.css';

/**
 * SectionHeader: the plain-but-on-brand header for data-heavy pages. Pixel kicker, Barlow Condensed italic title, a gold
 * rule under it, an optional club logo on the left and a right slot. Props: title, kicker?, right?, club? (logo), as?
 * (heading tag, h2), className?. Use Marquee (bulbs) only where the site already runs scoreboards and jumbotrons.
 */
export const SectionHeader = ({ title, kicker, right, club, as: Tag = 'h2', className }: { title: ReactNode; kicker?: ReactNode; right?: ReactNode; club?: string | null; as?: ElementType; className?: string }) => (
  <header className={cn('ax-sechead', className)}>
    {club && <TeamLogo team={club} size={36} decorative />}
    <div className="ax-sechead__text">
      {kicker && <span className="ax-kicker">{kicker}</span>}
      <Tag className="ax-sechead__title">{title}</Tag>
    </div>
    {right && <div className="ax-sechead__right">{right}</div>}
  </header>
);
export default SectionHeader;
