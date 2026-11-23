import type { ReactNode } from 'react';
import TeamLogo from '@/components/brand/TeamLogo';
import { findNFLTeam } from '@/utils/nflTeams';
import type { GradeStep } from '@/config/skillGrades';
import { GradeChip } from '../parts';

export interface Led {
  label: string;
  grade?: GradeStep | null;
  value?: ReactNode;
  title?: string;
  game?: boolean;
}

/** The stadium's jumbotron for the NFL lab: crest, title, sub line and a four-lamp scoreboard. */
const NflHeader = ({ kitClub, kicker, title, sub, leds, children }: { kitClub: string; kicker: string; title: ReactNode; sub: string; leds: Led[]; children?: ReactNode }) => {
  const t = findNFLTeam(kitClub);
  return (
    <header className="lab-jumbo">
      <span className="lab-jumbo-crest" aria-hidden="true">
        <TeamLogo team={kitClub} size={220} decorative />
      </span>
      <div className="lab-jumbo-main">
        <div className="lab-jumbo-id">
          <span className="lab-jumbo-logo">
            <TeamLogo team={kitClub} size={44} decorative priority />
          </span>
          <div className="min-w-0">
            <p className="lab-kicker">
              {kicker} · {t?.fullName ?? kitClub} kits
            </p>
            <h1 className="lab-title">{title}</h1>
            <p className="lab-sub">{sub}</p>
          </div>
        </div>
        <div className="lab-scoreboard" aria-label="Scoreboard">
          {leds.map((l) => (
            <div key={l.label} className={`lab-led${l.game ? ' lab-led--game' : ''}`} title={l.title}>
              <span className="lab-led-k">{l.label}</span>
              {l.grade || l.value != null ? (
                <span className="lab-led-v">
                  {l.grade && <GradeChip grade={l.grade} size="md" label={`${l.label} grade ${l.grade.grade}`} />}
                  {l.value != null && <b className={l.grade ? '' : 'lab-led-pix'}>{l.value}</b>}
                </span>
              ) : (
                <span className="lab-led-v lab-led-off">--</span>
              )}
            </div>
          ))}
        </div>
      </div>
      {children}
    </header>
  );
};

export default NflHeader;
