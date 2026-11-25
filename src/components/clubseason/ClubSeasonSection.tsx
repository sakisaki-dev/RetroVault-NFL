import type { ReactNode } from 'react';
import TeamLogo from '@/components/brand/TeamLogo';
import { Reveal } from '@/components/motion/Reveal';

/** A section of the club season sheet: a club-colour flag with the club's logo, the kicker and title, a rule; its header rises in as it scrolls into view. */
export const Section = ({ kicker, title, club, children }: { kicker: string; title: string; club: string; children: ReactNode }) => (
  <Reveal as="section" className="cs-block">
    <header className="cs-sec__h mo-rise">
      <TeamLogo team={club} size={22} decorative className="cs-logo-plate" />
      <span className="cs-sec__t"><span>{kicker}</span><h3>{title}</h3></span>
      <i className="cs-sec__rule" aria-hidden="true" />
    </header>
    {children}
  </Reveal>
);
