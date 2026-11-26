import { useMemo, useState, type CSSProperties } from 'react';
import { HeartPulse } from 'lucide-react';
import type { Player } from '@/types/player';
import { useInjuryList, type InjuryCode } from '@/utils/injuries';
import { keyOfPlayer } from '@/utils/playerSearch';
import { displayName } from '@/utils/displayName';
import { PlayerStrip } from '@/components/brand/ClubStrip';
import TeamLogo from '@/components/brand/TeamLogo';
import GameSprite from '@/components/GameSprite';
import { peekKeyProps } from '@/components/peek/peekProps';
import { teamVars } from '@/components/news/clubArt';

/**
 * The News page's Injuries section: the real injury report (public/data/nfl/injuries.json, the same file the Season page
 * reads), not a filter of ESPN stories. One club picked: its injured players by status. All teams: every club's report,
 * the clubs with the most notable players first. A club with nobody listed says so in one line and the league list shows.
 */
const HURT: Record<InjuryCode, { label: string; ink: string; rank: number }> = {
  IR: { label: 'IR', ink: 'hsl(0 78% 62%)', rank: 0 },
  Out: { label: 'Out', ink: 'hsl(0 78% 62%)', rank: 1 },
  Doubtful: { label: 'Doubtful', ink: 'hsl(24 95% 58%)', rank: 2 },
  Questionable: { label: 'Questionable', ink: 'hsl(40 95% 58%)', rank: 3 },
};
const CODES: InjuryCode[] = ['IR', 'Out', 'Doubtful', 'Questionable'];
const CLUBS_SHOWN = 8;
/** the nickname the news chips use ("Pittsburgh Steelers" -> "Steelers") */
const nick = (t: string) => t.split(' ').slice(-1)[0];

interface Row { key: string; code: InjuryCode; part: string; p: Player; club: string }

const InjuryRow = ({ r }: { r: Row }) => {
  const h = HURT[r.code];
  return (
    <li className="en-inj__row" {...peekKeyProps(r.key)} style={teamVars(r.club) as CSSProperties}>
      <span className="en-inj__bust" aria-hidden>
        <GameSprite player={{ name: r.p.name, position: r.p.position, team: r.p.team, bannerTeam: r.p.bannerTeam }} team={r.club} kind="bust" size="s" />
      </span>
      <span className="en-inj__who">
        <PlayerStrip name={displayName(r.p.name)} position={r.p.position} team={r.club} card size="sm" />
        {r.part && <span className="en-inj__part">{r.part}</span>}
      </span>
      <span className="en-inj__tag" style={{ color: h.ink }} title={r.part ? `${h.label}: ${r.part}` : h.label}>
        <i aria-hidden />
        {h.label}
      </span>
    </li>
  );
};

export const InjuryDesk = ({ players, team, onTeam }: { players: Player[]; team: string; onTeam: (t: string) => void }) => {
  const list = useInjuryList();
  const [all, setAll] = useState(false);
  // a club's "+N more" opens the rest of its report in place (owner: pressing it "doesn't do anything")
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const rows = useMemo<Row[]>(() => {
    if (!list) return [];
    const byKey = new Map(players.map((p) => [keyOfPlayer(p), p]));
    return list.entries
      .map((e) => ({ ...e, p: byKey.get(e.key) }))
      .filter((e): e is typeof e & { p: Player } => !!e.p && !!e.p.team && e.p.team !== 'FA')
      .map((e) => ({ key: e.key, code: e.code, part: e.part, p: e.p, club: e.p.team }))
      .sort((a, b) => HURT[a.code].rank - HURT[b.code].rank || (b.p.careerLegacy ?? 0) - (a.p.careerLegacy ?? 0) || a.key.localeCompare(b.key));
  }, [list, players]);

  const clubs = useMemo(() => {
    const m = new Map<string, Row[]>();
    rows.forEach((r) => m.set(r.club, [...(m.get(r.club) ?? []), r]));
    return [...m.entries()]
      .map(([club, rs]) => ({ club, rs, top: Math.max(...rs.map((r) => r.p.careerLegacy ?? 0)) }))
      .sort((a, b) => b.top - a.top || a.club.localeCompare(b.club));
  }, [rows]);

  if (!list) return <section className="en-inj en-mod"><p className="en-inj__none">Loading the injury report…</p></section>;
  const mine = team !== 'all' ? rows.filter((r) => nick(r.club) === team) : [];
  const clubMode = team !== 'all' && mine.length > 0;
  const shownClubs = all ? clubs : clubs.slice(0, CLUBS_SHOWN);

  return (
    <section className="en-inj en-mod" aria-label="Injury report" style={(team !== 'all' ? teamVars(team) : undefined) as CSSProperties}>
      <header className="en-inj__head">
        <HeartPulse className="h-5 w-5" aria-hidden />
        <div>
          <p className="en-rub__kicker">Injury report · week {list.week}</p>
          <h3 className="en-rub__title">
            {team !== 'all' ? team : 'Around the league'}
            <span className="en-rub__n">{team !== 'all' ? mine.length : rows.length}</span>
          </h3>
        </div>
        <span className="en-inj__lamps">
          {CODES.map((c) => {
            const n = (team !== 'all' && clubMode ? mine : rows).filter((r) => r.code === c).length;
            return n ? <span key={c} style={{ color: HURT[c].ink }}><i aria-hidden />{HURT[c].label} {n}</span> : null;
          })}
        </span>
      </header>

      {team !== 'all' && !clubMode && (
        <p className="en-inj__none">
          <TeamLogo team={team} size={18} decorative /> No {team} players on the report this week.
          <button type="button" className="en-refresh" onClick={() => onTeam('all')}>All clubs</button>
        </p>
      )}

      {clubMode &&
        CODES.map((c) => {
          const rs = mine.filter((r) => r.code === c);
          return rs.length ? (
            <div key={c} className="en-inj__group">
              <h4 style={{ color: HURT[c].ink }}>{HURT[c].label} <b>{rs.length}</b></h4>
              <ul className="en-inj__list">{rs.map((r) => <InjuryRow key={r.key} r={r} />)}</ul>
            </div>
          ) : null;
        })}

      {!clubMode &&
        shownClubs.map(({ club, rs }) => (
          <div key={club} className="en-inj__group en-inj__club" style={teamVars(club) as CSSProperties}>
            <h4>
              <button type="button" onClick={() => onTeam(club)} aria-label={`Show only the ${nick(club)} report`}>
                <TeamLogo team={club} size={20} decorative /> {nick(club)} <b>{rs.length}</b>
              </button>
            </h4>
            <ul className="en-inj__list">{(open.has(club) ? rs : rs.slice(0, 6)).map((r) => <InjuryRow key={r.key} r={r} />)}</ul>
            {rs.length > 6 && (
              <button type="button" className="en-inj__more" aria-expanded={open.has(club)}
                onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(club)) n.delete(club); else n.add(club); return n; })}>
                {open.has(club) ? `Show fewer ${nick(club)}` : `+ ${rs.length - 6} more on the ${nick(club)} report`}
              </button>
            )}
          </div>
        ))}
      {!clubMode && clubs.length > CLUBS_SHOWN && (
        <button type="button" className="en-sec-more" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? 'Show fewer clubs' : `+ ${clubs.length - CLUBS_SHOWN} more clubs`}
        </button>
      )}
    </section>
  );
};
