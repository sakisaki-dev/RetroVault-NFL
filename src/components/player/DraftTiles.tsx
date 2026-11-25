import { useState } from 'react';
import { ListOrdered } from 'lucide-react';
import TeamLogo from '@/components/brand/TeamLogo';
import { findNFLTeam } from '@/utils/nflTeams';
import { useDraftInfo, type DraftInfo } from '@/utils/draftInfo';
import { cn } from '@/lib/utils';

const initials = (s: string) => s.replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean).slice(0, 3).map((w) => w[0]).join('').toUpperCase();

/**
 * A school's mark on a white puck, like the club logo beside it: ESPN's standard (light-background) college logo, which
 * reads on white for every school (on our navy the dark reds and navies faded and black text vanished, Ohio State's),
 * then the dark-background logo, then a plate in the school's colours with its short name.
 */
export const CollegeMark = ({ info, size = 40 }: { info: DraftInfo; size?: number }) => {
  const [step, setStep] = useState(0);
  const s = info.school;
  if (!s) return null;
  if (s.id && step < 2) {
    const pad = Math.max(2, Math.round(size * 0.1));
    return (
      <span className="pc-college__puck" style={{ width: size, height: size, padding: pad }} aria-hidden="true">
        <img
          key={step}
          src={`https://a.espncdn.com/i/teamlogos/ncaa/${step === 0 ? '500' : '500-dark'}/${s.id}.png`}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setStep((n) => n + 1)}
          className="pc-college__logo"
        />
      </span>
    );
  }
  const bg = `#${s.c || '1f2742'}`;
  const fg = parseInt((s.c || '1f2742').slice(0, 2), 16) * 0.3 + parseInt((s.c || '1f2742').slice(2, 4), 16) * 0.59 + parseInt((s.c || '1f2742').slice(4, 6), 16) * 0.11 > 150 ? '#10131f' : '#fff';
  return (
    <span className="pc-college__plate" style={{ width: size, height: size, fontSize: Math.max(7, Math.round(size * 0.34)), background: bg, color: fg, boxShadow: `inset 0 0 0 2px #${s.a || 'ffffff'}66` }} aria-hidden="true">
      {initials(s.s)}
    </span>
  );
};

/**
 * College and Draft tiles for the identity row (.pc-ids), same tile style as Position / Number / Club. Nothing when the
 * player has no college and no draft record. `bannerClub` hides the drafting club's logo when it is his banner club.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const DraftTiles = ({ playerKey, bannerClub: _bannerClub }: { playerKey: string; bannerClub?: string | null }) => {
  const info = useDraftInfo(playerKey);
  if (!info || (!info.college && !info.drafted)) return null;
  const club = info.club ? findNFLTeam(info.club) : null;
  return (
    <>
      {info.college && info.school && (
        <div className={'pc-tile pc-tile--college'} title={info.alsoAttended.length ? `Also attended: ${info.alsoAttended.join(', ')}` : undefined}>
          <CollegeMark info={info} size={56} />
          <span className="pc-tile__k">College</span>
          <span className="pc-tile__v pc-tile__v--fit">{info.school.s}</span>
        </div>
      )}
      <div className={cn('pc-tile pc-tile--draft', !info.college && 'pc-tile--wide')}>
        {info.drafted && club ? (
          <span className="pc-draft__mark" title={`Drafted by the ${club.fullName}`}>
            <TeamLogo team={club} size={56} decorative />
          </span>
        ) : (
          <span className="pc-tile__icon"><ListOrdered aria-hidden="true" /></span>
        )}
        <span className="pc-tile__k">Draft{info.drafted && info.year ? ` ${info.year}` : ''}</span>
        {info.drafted ? (
          <span className="pc-tile__v pc-tile__v--fit">Round {info.round} · Pick {info.pick}</span>
        ) : (
          <span className="pc-tile__v pc-tile__v--fit">Undrafted</span>
        )}
      </div>
    </>
  );
};

/**
 * College and Draft as two small pills, in the Deep Dive hero's franchise-pill format (logo + short text), placed before
 * his clubs. Nothing when there is no record.
 */
export const DraftPills = ({ playerKey }: { playerKey: string }) => {
  const info = useDraftInfo(playerKey);
  if (!info || (!info.college && !info.drafted)) return null;
  const club = info.club ? findNFLTeam(info.club) : null;
  const pill = 'inline-flex items-center gap-1 rounded-full border border-line bg-panel px-2 py-0.5 text-xs';
  return (
    <>
      {info.college && info.school && (
        <span className={pill} title={info.alsoAttended.length ? `Also attended: ${info.alsoAttended.join(', ')}` : 'College'}>
          <CollegeMark info={info} size={16} />
          <span>{info.school.s}</span>
        </span>
      )}
      <span className={pill} title={info.drafted && club ? `Drafted by the ${club.fullName}` : 'Draft'}>
        {info.drafted && club ? <TeamLogo team={club} size={16} decorative backed /> : <ListOrdered className="h-3.5 w-3.5" aria-hidden="true" />}
        <span>{info.drafted ? `${info.year} · Rd ${info.round} · Pick ${info.pick}` : 'Undrafted'}</span>
      </span>
    </>
  );
};

export default DraftTiles;
