import { useState } from 'react';
import { ListOrdered } from 'lucide-react';
import TeamLogo from '@/components/brand/TeamLogo';
import { findNFLTeam } from '@/utils/nflTeams';
import { useDraftInfo, type DraftInfo } from '@/utils/draftInfo';
import { cn } from '@/lib/utils';
import { openCollege, useCollegeIndex } from '@/utils/collegeData';
import { openTeamPage } from '@/utils/teamSearch';

/**
 * Where a player's college, draft and club go. In-site first: the College tab's school page (slug from the college index by
 * school name) and that year's draft board (index years), the club's team sheet; else ESPN's college team page (id from
 * draft.json) or ESPN's draft page for the year. Every id comes from data.
 */
type Dest = { go: () => void } | { href: string } | null;
export const useDraftLinks = (info: DraftInfo | null) => {
  const idx = useCollegeIndex();
  const slug = info?.college && idx ? idx.schools.find((r) => r[1] === info.college)?.[0] ?? null : null;
  const hasYear = !!(info?.year && idx?.years.some((y) => y[0] === info.year));
  const school: Dest = !info?.college ? null : slug ? { go: () => openCollege('schools', { s: slug }) } : info.school?.id ? { href: `https://www.espn.com/college-football/team/_/id/${info.school.id}` } : null;
  const draft: Dest = !info?.drafted || !info.year ? null : hasYear ? { go: () => openCollege('draft', { y: String(info.year), ...(info.round ? { r: String(info.round) } : {}) }) } : { href: `https://www.espn.com/nfl/draft/rounds/_/season/${info.year}` };
  return { school, draft };
};

/** A tile or pill that is a button (in-site) or a new-tab link (ESPN); a plain element when there is nowhere to go. */
const Linked = ({ dest, className, title, onLeave, children }: { dest: Dest; className: string; title?: string; onLeave?: () => void; children: React.ReactNode }) => {
  if (!dest) return <div className={className} title={title}>{children}</div>;
  const cls = cn(className, 'ix-card cursor-pointer text-inherit no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold');
  if ('href' in dest)
    return (
      <a href={dest.href} target="_blank" rel="noopener noreferrer" className={cls} title={`${title ? title + ' · ' : ''}Opens ESPN in a new tab`}>
        {children}
      </a>
    );
  return (
    <button type="button" className={cls} title={title} onClick={() => { onLeave?.(); dest.go(); }}>
      {children}
    </button>
  );
};

const initials = (s: string) => s.replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean).slice(0, 3).map((w) => w[0]).join('').toUpperCase();

/**
 * A school's mark: ESPN's dark-background college logo (the standard ones black out text like Ohio State's on our navy)
 * at full size; a school whose mark still doesn't read on navy (draft.json "w", derived from the logo's own contrast in
 * scripts/nfl/draft.py) sits on a white puck with ESPN's standard logo. Else a plate in the school's colours.
 */
export const CollegeMark = ({ info, size = 40 }: { info: DraftInfo; size?: number }) => {
  const [step, setStep] = useState(0);
  const s = info.school;
  if (!s) return null;
  if (s.id && step < 2) {
    const white = !!s.w;
    const variant = white ? (step === 0 ? '500' : '500-dark') : step === 0 ? '500-dark' : '500';
    const img = (
      <img
        key={step}
        src={`https://a.espncdn.com/i/teamlogos/ncaa/${variant}/${s.id}.png`}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setStep((n) => n + 1)}
        className="pc-college__logo"
        style={white ? undefined : { width: size, height: size }}
      />
    );
    return white ? (
      <span className="pc-college__puck" style={{ width: size, height: size, padding: Math.max(2, Math.round(size * 0.1)) }} aria-hidden="true">
        {img}
      </span>
    ) : (
      img
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
const DraftTiles = ({ playerKey, bannerClub: _bannerClub, onLeave }: { playerKey: string; bannerClub?: string | null; onLeave?: () => void }) => {
  const info = useDraftInfo(playerKey);
  const links = useDraftLinks(info);
  if (!info || (!info.college && !info.drafted)) return null;
  const club = info.club ? findNFLTeam(info.club) : null;
  return (
    <>
      {info.college && info.school && (
        <Linked dest={links.school} onLeave={onLeave} className={'pc-tile pc-tile--college'} title={info.alsoAttended.length ? `Also attended: ${info.alsoAttended.join(', ')}` : undefined}>
          <CollegeMark info={info} size={56} />
          <span className="pc-tile__k">College</span>
          <span className="pc-tile__v pc-tile__v--fit">{info.school.s}</span>
        </Linked>
      )}
      <Linked dest={links.draft} onLeave={onLeave} className={cn('pc-tile pc-tile--draft', !info.college && 'pc-tile--wide')}>
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
      </Linked>
    </>
  );
};

/**
 * College and Draft as two small pills, in the Deep Dive hero's franchise-pill format (logo + short text), placed before
 * his clubs. Nothing when there is no record.
 */
export const DraftPills = ({ playerKey }: { playerKey: string }) => {
  const info = useDraftInfo(playerKey);
  const links = useDraftLinks(info);
  if (!info || (!info.college && !info.drafted)) return null;
  const club = info.club ? findNFLTeam(info.club) : null;
  const pill = 'inline-flex items-center gap-1 rounded-full border border-line bg-panel px-2 py-0.5 text-xs';
  return (
    <>
      {info.college && info.school && (
        <Linked dest={links.school} className={pill} title={info.alsoAttended.length ? `Also attended: ${info.alsoAttended.join(', ')}` : 'College'}>
          <CollegeMark info={info} size={16} />
          <span>{info.school.s}</span>
        </Linked>
      )}
      <Linked dest={links.draft} className={pill} title={info.drafted && club ? `Drafted by the ${club.fullName}` : 'Draft'}>
        {info.drafted && club ? <TeamLogo team={club} size={16} decorative backed /> : <ListOrdered className="h-3.5 w-3.5" aria-hidden="true" />}
        <span>{info.drafted ? `${info.year} · Rd ${info.round} · Pick ${info.pick}` : 'Undrafted'}</span>
      </Linked>
    </>
  );
};

export default DraftTiles;
