import { useMemo, type CSSProperties } from 'react';
import type { Player } from '@/types/player';
import { useLeague } from '@/context/LeagueContext';
import { useGameSprites } from '@/utils/gameSprites';
import { bannerTeamOf } from '@/utils/playerExtras';
import { findNFLTeam } from '@/utils/nflTeams';
import { getReadableTextOn } from '@/utils/teamColors';
import GameSprite, { type SpriteSize } from '@/components/GameSprite';
import TeamLogo from '@/components/brand/TeamLogo';
import { PlayerStrip } from '@/components/brand/ClubStrip';
import { CollegeMark } from '@/components/player/DraftTiles';
import { markInfo, type SchoolInfo } from '@/utils/collegeData';
import type { SpriteAction } from '@/utils/gameSprites';

/** Site players by "POS:Name" */
export const usePlayerMap = () => {
  const { getAllPlayers, dataVersion } = useLeague();
  return useMemo(() => {
    const m = new Map<string, Player>();
    getAllPlayers().forEach((p) => {
      if (!p.isRealLegend) m.set(`${p.position}:${p.name}`, p);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getAllPlayers, dataVersion]);
};

/** A club's flat colours as CSS variables (--cl-c club primary, --cl-e secondary, --cl-ink readable text on it) */
export const clubColors = (club: string | null | undefined): CSSProperties => {
  const t = findNFLTeam(club ?? '');
  if (!t) return {};
  return { '--cl-c': `hsl(${t.primaryColor})`, '--cl-e': `hsl(${t.secondaryColor})`, '--cl-ink': getReadableTextOn(t.primaryColor) } as CSSProperties;
};

/** A school's flat colours (ESPN's hex) as --cl-sc / --cl-sa and a readable ink */
const lumOf = (hex: string) => {
  const h = hex.padEnd(6, '0');
  return parseInt(h.slice(0, 2), 16) * 0.3 + parseInt(h.slice(2, 4), 16) * 0.59 + parseInt(h.slice(4, 6), 16) * 0.11;
};
/**
 * A school's flat colours (ESPN's hex): --cl-sc the colour, --cl-sa the alternate, --cl-sink readable text on the colour,
 * and --cl-sl an accent that reads on the night panels (the colour itself, else its alternate when that is lighter,
 * else the colour lifted toward white), for bars and rules: a black school (Eastern Illinois) would vanish otherwise.
 */
export const schoolColors = (s: SchoolInfo | null | undefined): CSSProperties => {
  const ch = s?.c || '1f2742';
  const c = `#${ch}`;
  const a = s?.a ? `#${s.a}` : '#ffffff';
  const lum = lumOf(ch);
  const lift = lum >= 45 ? c : s?.a && lumOf(s.a) >= 70 ? a : `color-mix(in srgb, ${c} 45%, #fff)`;
  return { '--cl-sc': c, '--cl-sa': a, '--cl-sl': lift, '--cl-sink': lum > 150 ? '#10131f' : '#fff' } as CSSProperties;
};

/** The player's name as a club-colour strip (his Deep Dive) when he has a card, else plain text */
export const PickName = ({ name, siteKey, club, size = 'sm' }: { name: string; siteKey: string | null; club: string; size?: 'sm' | 'md' }) => {
  if (!siteKey) return <span className="cl-plainname">{name}</span>;
  const [pos, ...rest] = siteKey.split(':');
  return <PlayerStrip name={rest.join(':')} position={pos} team={club} size={size} />;
};

/** A school's mark and short name as a button to its page */
export const SchoolLink = ({ school, onOpen, size = 18, full }: { school: SchoolInfo & { slug?: string }; onOpen?: (slug: string) => void; size?: number; full?: boolean }) => {
  const info = markInfo(school);
  const body = (
    <>
      {info && <CollegeMark info={info} size={size} />}
      <span className="cl-school__n">{full ? school.name : school.s}</span>
    </>
  );
  return onOpen && school.slug ? (
    <button type="button" className="cl-school" onClick={() => onOpen(school.slug!)} aria-label={`${school.name}: open the school page`}>
      {body}
    </button>
  ) : (
    <span className="cl-school">{body}</span>
  );
};

/** His game sprite in a club's kit; the club's logo in the public build, or for a pick without a card */
export const Figure = ({ player, club, kind = 'figure', size = 's', action = 'idle', logo = 44 }: { player: Player | null | undefined; club: string; kind?: 'figure' | 'bust'; size?: SpriteSize; action?: SpriteAction; logo?: number }) => {
  const sprites = useGameSprites();
  if (sprites && player) return <GameSprite player={player} team={club || bannerTeamOf(player)} kind={kind} size={size} action={action} />;
  return <TeamLogo team={club} size={logo} decorative />;
};

/** What became of a pick: Hall of Fame, All-Pro, Pro Bowls, the site's career OVR, games */
export const Outcome = ({ hof, ap, pb, ovr, g, compact }: { hof: number; ap: number; pb: number; ovr: number | null; g: number | null; compact?: boolean }) => (
  <span className="cl-out">
    {hof > 0 && <span className="cl-badge cl-badge--hof" title={hof === 2 ? 'Hall of Famer (on the site)' : 'Hall of Famer (draft file)'}>HOF</span>}
    {ap > 0 && <span className="cl-badge cl-badge--ap" title={`${ap} first-team All-Pro`}>{ap}× AP</span>}
    {pb > 0 && <span className="cl-badge cl-badge--pb" title={`${pb} Pro Bowls`}>{pb}× PB</span>}
    {ovr != null && <span className="cl-badge cl-badge--ovr" title="Career OVR on the site">OVR {ovr}</span>}
    {!compact && g != null && g > 0 && <span className="cl-badge cl-badge--g" title="Career games (draft file)">{g} G</span>}
    {!compact && (g == null || g === 0) && hof === 0 && ap === 0 && pb === 0 && ovr == null && <span className="cl-badge cl-badge--none">No NFL games on file</span>}
  </span>
);
