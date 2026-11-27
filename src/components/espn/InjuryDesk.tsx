import { useMemo, useState, type CSSProperties } from 'react';
import { HeartPulse, Star } from 'lucide-react';
import type { Player } from '@/types/player';
import { useInjuryList, type InjuryCode } from '@/utils/injuries';
import { keyOfPlayer } from '@/utils/playerSearch';
import { displayName } from '@/utils/displayName';
import { PlayerStrip } from '@/components/brand/ClubStrip';
import TeamLogo from '@/components/brand/TeamLogo';
import GameSprite from '@/components/GameSprite';
import { peekKeyProps } from '@/components/peek/peekProps';
import { teamVars } from '@/components/news/clubArt';
import { PillScroller } from '@/components/controls';
import { findNFLTeam } from '@/utils/nflTeams';

/**
 * The News page's Injuries section: the real injury report (public/data/nfl/injuries.json, the same file the Season page
 * reads), not a filter of ESPN stories. One club picked: its injured players by status. All teams: every club's report,
 * the clubs with the most notable players first. A club with nobody listed says so in one line and the league list shows.
 */
const HURT: Record<InjuryCode, { label: string; ink: string; rank: number }> = {
  IR: { label: 'IR', ink: 'hsl(0 78% 62%)', rank: 0 },
  Out: { label: 'Out', ink: 'hsl(14 90% 58%)', rank: 1 },
  Doubtful: { label: 'Doubtful', ink: 'hsl(24 95% 58%)', rank: 2 },
  Questionable: { label: 'Questionable', ink: 'hsl(40 95% 58%)', rank: 3 },
};
const CODES: InjuryCode[] = ['IR', 'Out', 'Doubtful', 'Questionable'];
const CLUBS_SHOWN = 8;
/** the nickname the news chips use ("Pittsburgh Steelers" -> "Steelers") */
const nick = (t: string) => t.split(' ').slice(-1)[0];

interface Row { key: string; code: InjuryCode; part: string; p: Player; club: string }

/** the division a club plays in ("AFC East"), '' when unknown */
const divisionOf = (club: string) => { const t = findNFLTeam(club); return t ? `${t.conference} ${t.division}` : ''; };
const CONFS = ['AFC', 'NFC'];

const InjuryRow = ({ r, star }: { r: Row; star?: boolean }) => {
  const h = HURT[r.code];
  return (
    <li className="en-inj__row" data-code={r.code} {...peekKeyProps(r.key)} style={teamVars(r.club) as CSSProperties}>
      <span className="en-inj__bust" aria-hidden>
        {star && <Star className="en-inj__star" aria-hidden />}
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
  const [only, setOnly] = useState<InjuryCode | 'all'>('all');
  const [zone, setZone] = useState('all');
  // a club's "+N more" opens the rest of its report in place (owner: pressing it "doesn't do anything")
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const rows = useMemo<Row[]>(() => {
    if (!list) return [];
    const byKey = new Map(players.map((p) => [keyOfPlayer(p), p]));
    return list.entries
      .map((e) => ({ ...e, p: byKey.get(e.key) }))
      .filter((e): e is typeof e & { p: Player } => !!e.p && !!e.p.team && e.p.team !== 'FA')
      .map((e) => ({ key: e.key, code: e.code, part: e.part, p: e.p, club: e.p.team }))
      // stars first (his club's biggest names lead the chart), then the worse status, then the key
      .sort((a, b) => (b.p.careerLegacy ?? 0) - (a.p.careerLegacy ?? 0) || HURT[a.code].rank - HURT[b.code].rank || a.key.localeCompare(b.key));
  }, [list, players]);

  // the status and division pills narrow the league view; a club picked in the header's chips shows that club alone
  const view = useMemo(() => rows.filter((r) => (only === 'all' || r.code === only) && (zone === 'all' || divisionOf(r.club).startsWith(zone))), [rows, only, zone]);
  const clubs = useMemo(() => {
    const m = new Map<string, Row[]>();
    view.forEach((r) => m.set(r.club, [...(m.get(r.club) ?? []), r]));
    return [...m.entries()]
      .map(([club, rs]) => ({ club, rs, top: Math.max(...rs.map((r) => r.p.careerLegacy ?? 0)) }))
      .sort((a, b) => b.top - a.top || a.club.localeCompare(b.club));
  }, [view]);
  const zones = useMemo(() => {
    const seen = new Set(rows.map((r) => divisionOf(r.club)).filter(Boolean));
    return [{ value: 'all', label: 'All clubs' }, ...CONFS.map((c) => ({ value: c, label: c })), ...[...seen].sort().map((d) => ({ value: d, label: d.replace(/^(AFC|NFC) /, '$1 ') }))];
  }, [rows]);

  if (!list) return <section className="en-inj en-mod"><p className="en-inj__none">Loading the injury report…</p></section>;
  const mine = team !== 'all' ? rows.filter((r) => nick(r.club) === team) : [];
  const clubMode = team !== 'all' && mine.length > 0;
  const base = clubMode ? mine : rows;
  const count = (c: InjuryCode) => base.filter((r) => r.code === c).length;
  const shownClubs = all ? clubs : clubs.slice(0, CLUBS_SHOWN);
  const names = base.slice(0, 4);

  return (
    <section className="en-inj en-mod" aria-label="Injury report" style={(team !== 'all' ? teamVars(team) : undefined) as CSSProperties}>
      <div className="en-inj__board">
        <header className="en-inj__head">
          <HeartPulse className="h-5 w-5" aria-hidden />
          <div>
            <p className="en-rub__kicker">Injury report · week {list.week}</p>
            <h3 className="en-rub__title">{team !== 'all' ? team : 'Around the league'}</h3>
          </div>
          <b className="en-inj__total" aria-label={`${base.length} players on the report`}>{base.length}</b>
        </header>
        <div className="en-inj__lamps" role="group" aria-label="Filter by status">
          {CODES.map((c) => {
            const n = count(c);
            return (
              <button key={c} type="button" className="en-inj__lamp" data-code={c} data-on={only === c ? '' : undefined} aria-pressed={only === c} disabled={!n}
                style={{ '--hurt': HURT[c].ink } as CSSProperties} onClick={() => setOnly(only === c ? 'all' : c)}>
                <i aria-hidden />
                <b>{n}</b>
                <span>{HURT[c].label}</span>
              </button>
            );
          })}
        </div>
        {names.length > 0 && (
          <div className="en-inj__bench" aria-label="Biggest names on the report">
            {names.map((r) => (
              <div key={r.key} className="en-inj__big" {...peekKeyProps(r.key)} style={teamVars(r.club) as CSSProperties}>
                <GameSprite player={{ name: r.p.name, position: r.p.position, team: r.p.team, bannerTeam: r.p.bannerTeam }} team={r.club} kind="figure" size="s" />
                <PlayerStrip name={displayName(r.p.name)} position={r.p.position} team={r.club} card size="sm" />
                <span className="en-inj__tag" style={{ color: HURT[r.code].ink }}><i aria-hidden />{HURT[r.code].label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {!clubMode && team === 'all' && (
        <PillScroller className="en-inj__zones" label="Conference or division" options={zones} value={zone} onChange={(v) => setZone(String(v))} />
      )}

      {team !== 'all' && !clubMode && (
        <p className="en-inj__none">
          <TeamLogo team={team} size={18} decorative /> No {team} players on the report this week.
          <button type="button" className="en-refresh" onClick={() => onTeam('all')}>All clubs</button>
        </p>
      )}

      {clubMode && (
        <div className="en-inj__chart" style={teamVars(team) as CSSProperties}>
          {CODES.filter((c) => only === 'all' || only === c).map((c) => {
            const rs = mine.filter((r) => r.code === c);
            return rs.length ? (
              <div key={c} className="en-inj__group">
                <h4 style={{ color: HURT[c].ink }}>{HURT[c].label} <b>{rs.length}</b></h4>
                <ul className="en-inj__list">{rs.map((r) => <InjuryRow key={r.key} r={r} />)}</ul>
              </div>
            ) : null;
          })}
        </div>
      )}

      {!clubMode && view.length === 0 && team === 'all' && <p className="en-inj__none">Nobody on the report for that filter.</p>}

      {!clubMode && (
        <div className="en-inj__clubs">
          {shownClubs.map(({ club, rs }) => {
            const n = (c: InjuryCode) => rs.filter((r) => r.code === c).length;
            const star = rs[0]?.key;
            return (
              <article key={club} className="en-inj__card" style={teamVars(club) as CSSProperties}>
                <span className="en-inj__clip" aria-hidden />
                <h4 className="en-inj__chead">
                  <button type="button" onClick={() => onTeam(club)} aria-label={`Show only the ${nick(club)} report`}>
                    <TeamLogo team={club} size={26} decorative />
                    <span>{nick(club)}</span>
                  </button>
                  <b>{rs.length}</b>
                </h4>
                <div className="en-inj__meter" aria-hidden>
                  {CODES.map((c) => n(c) > 0 && <i key={c} style={{ flexGrow: n(c), background: HURT[c].ink }} />)}
                </div>
                <ul className="en-inj__list">{(open.has(club) ? rs : rs.slice(0, 6)).map((r) => <InjuryRow key={r.key} r={r} star={r.key === star && rs.length > 1} />)}</ul>
                {rs.length > 6 && (
                  <button type="button" className="en-inj__more" aria-expanded={open.has(club)}
                    onClick={() => setOpen((o) => { const m = new Set(o); if (m.has(club)) m.delete(club); else m.add(club); return m; })}>
                    {open.has(club) ? `Show fewer ${nick(club)}` : `+ ${rs.length - 6} more on the ${nick(club)} report`}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
      {!clubMode && clubs.length > CLUBS_SHOWN && (
        <button type="button" className="en-sec-more" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? 'Show fewer clubs' : `+ ${clubs.length - CLUBS_SHOWN} more clubs`}
        </button>
      )}
    </section>
  );
};
