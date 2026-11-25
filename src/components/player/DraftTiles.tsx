import { useState } from 'react';
import { ListOrdered } from 'lucide-react';
import TeamLogo from '@/components/brand/TeamLogo';
import { findNFLTeam } from '@/utils/nflTeams';
import { useDraftInfo, type DraftInfo } from '@/utils/draftInfo';
import { cn } from '@/lib/utils';

const initials = (s: string) => s.replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean).slice(0, 3).map((w) => w[0]).join('').toUpperCase();

/** A school's mark: ESPN's college logo, else a plate in the school's colours with its short name. */
export const CollegeMark = ({ info, size = 40 }: { info: DraftInfo; size?: number }) => {
  const [bad, setBad] = useState(false);
  const s = info.school;
  if (!s) return null;
  if (s.id && !bad) {
    return (
      <img
        src={`https://a.espncdn.com/i/teamlogos/ncaa/500/${s.id}.png`}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setBad(true)}
        className="pc-college__logo"
        style={{ width: size, height: size }}
      />
    );
  }
  const bg = `#${s.c || '1f2742'}`;
  const fg = parseInt((s.c || '1f2742').slice(0, 2), 16) * 0.3 + parseInt((s.c || '1f2742').slice(2, 4), 16) * 0.59 + parseInt((s.c || '1f2742').slice(4, 6), 16) * 0.11 > 150 ? '#10131f' : '#fff';
  return (
    <span className="pc-college__plate" style={{ width: size, height: size, background: bg, color: fg, boxShadow: `inset 0 0 0 2px #${s.a || 'ffffff'}66` }} aria-hidden="true">
      {initials(s.s)}
    </span>
  );
};

/**
 * College and Draft tiles for the identity row (.pc-ids), same tile style as Position / Number / Club. Nothing when the
 * player has no college and no draft record. `bannerClub` hides the drafting club's logo when it is his banner club.
 */
const DraftTiles = ({ playerKey, bannerClub }: { playerKey: string; bannerClub?: string | null }) => {
  const info = useDraftInfo(playerKey);
  if (!info || (!info.college && !info.drafted)) return null;
  const club = info.club ? findNFLTeam(info.club) : null;
  const other = club && club.name !== findNFLTeam(bannerClub)?.name ? club : null;
  return (
    <>
      {info.college && info.school && (
        <div className={'pc-tile pc-tile--college'} title={info.alsoAttended.length ? `Also attended: ${info.alsoAttended.join(', ')}` : undefined}>
          <CollegeMark info={info} size={40} />
          <span className="pc-tile__k">College</span>
          <span className="pc-tile__v pc-tile__v--fit">{info.school.s}</span>
        </div>
      )}
      <div className={cn('pc-tile pc-tile--draft', !info.college && 'pc-tile--wide')}>
        {info.drafted && other ? (
          <span className="pc-logo-puck pc-tile__puck pc-draft__club" title={`Drafted by the ${other.fullName}`}>
            <TeamLogo team={other} size={40} decorative />
          </span>
        ) : (
          <span className="pc-tile__icon"><ListOrdered aria-hidden="true" /></span>
        )}
        <span className="pc-tile__k">Draft{info.drafted && info.year ? ` ${info.year}` : ''}</span>
        {info.drafted ? (
          <>
            <span className="pc-tile__v pc-tile__v--fit">Round {info.round}</span>
            <span className="pc-tile__sub pc-draft__pick">Pick {info.pick}{other ? ` · ${other.name}` : ''}</span>
          </>
        ) : (
          <span className="pc-tile__v pc-tile__v--fit">Undrafted</span>
        )}
      </div>
    </>
  );
};

export default DraftTiles;
