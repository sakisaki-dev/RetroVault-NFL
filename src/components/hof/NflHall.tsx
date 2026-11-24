import { useMemo, useState, type ReactNode } from 'react';
import { Crown } from 'lucide-react';
import type { Player } from '@/types/player';
import type { HallOfFameData, HofBallotEntry, HofWatchEntry } from '@/utils/hallOfFame';
import { normalizeName, type IndexedExtras } from '@/utils/playerExtras';
import { findNFLTeam } from '@/utils/nflTeams';
import TeamLogo from '../brand/TeamLogo';
import { GalleryTile, type GalleryItem } from './HofGallery';
import { HallHeading, Laurel, ScoreGauge } from './hofParts';
import HofShowcase from './HofShowcase';
import { careerLine, clubColors, fmt, yearsOf } from './hofUtils';
import { displayName } from '@/utils/displayName';

/**
 * The NFL edition's Hall of Fame page: Canton (the real inductees whose careers reach 1999 or later, newest class first),
 * the ballot (retired, eligible now), eligible soon, the snubs, and the Future Hall of Famers (actives on track).
 * Data: public/data/league/halloffame.json (scripts/hall_of_fame.py, NFL branch; docs/NFL_HOF.md).
 */

const PAGE = 12;
const CLASS_PAGE = 5;

const Pager = ({ total, shown, onMore, noun }: { total: number; shown: number; onMore: () => void; noun: string }) =>
  total > shown ? (
    <button
      type="button"
      onClick={onMore}
      className="mt-3 inline-flex min-h-[40px] w-full items-center justify-center rounded-lg border border-line bg-card px-4 text-sm font-semibold text-gold hover:border-gold/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
      Show more {noun} ({total - shown} left)
    </button>
  ) : null;

type Entry = HofBallotEntry | HofWatchEntry;

const Row = ({ entry, club, note, bar, chance, onOpen }: { entry: Entry; club: string; note: ReactNode; bar: number; chance?: number; onOpen?: () => void }) => {
  const team = findNFLTeam(club);
  const ink = clubColors(team).ink;
  const over = entry.score >= bar;
  const body = (
    <>
      <span className="flex items-center gap-2">
        <TeamLogo team={team ?? club} size={22} decorative />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-lg font-bold uppercase leading-tight" style={{ color: ink }}>
            {entry.name.replace(/ \(.*\)$/, '')}
          </span>
          <span className="block text-xs leading-snug text-muted-foreground">
            {entry.pos} · {note}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className={`block pr-0.5 font-display text-2xl font-extrabold italic leading-none tabular-nums ${over ? 'hof-metal-text' : 'text-chalk'}`}>{entry.score}</span>
          <span className="block font-pixel text-[8px] uppercase text-muted-foreground">{chance != null ? `${chance}% chance` : over ? 'Over the bar' : `${bar - entry.score} short`}</span>
        </span>
      </span>
      <ScoreGauge score={entry.score} bar={bar} label={`${displayName(entry.name)}: Hall of Fame Score ${entry.score}, bar ${bar}`} className="mt-2" />
    </>
  );
  const cls = `hof-rail ${over ? 'hof-rail--over border-amber-500/35' : 'border-line'} block w-full rounded-lg border bg-card py-3 pl-4 pr-3 text-left`;
  return onOpen ? (
    <button type="button" onClick={onOpen} data-player-key={entry.key} className={`${cls} transition-colors hover:border-gold/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
};

const Section = ({ id, kicker, title, sub, count, empty, children }: { id: string; kicker: string; title: string; sub: string; count: number; empty: string; children: ReactNode }) => (
  <section aria-labelledby={`${id}-title`} id={id} className="mb-10 scroll-mt-24">
    <HallHeading id={`${id}-title`} kicker={kicker} title={title} sub={sub} />
    {count ? children : <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted-foreground">{empty}</p>}
  </section>
);

const List = ({ rows, noun, render }: { rows: Entry[]; noun: string; render: (e: Entry) => ReactNode }) => {
  const [n, setN] = useState(PAGE);
  return (
    <>
      <ul className="grid gap-2 lg:grid-cols-2">
        {rows.slice(0, n).map((e) => (
          <li key={e.key}>{render(e)}</li>
        ))}
      </ul>
      <Pager total={rows.length} shown={n} onMore={() => setN(n + PAGE)} noun={noun} />
    </>
  );
};

const yearsAway = (from: number, now: number) => (from - now <= 1 ? 'next year' : `in ${from - now} years`);

const NflHall = ({
  hof,
  items,
  extras,
  players,
  clubOf,
  onOpenMember,
  onOpenCard,
}: {
  hof: HallOfFameData;
  items: GalleryItem[];
  extras: IndexedExtras;
  players: Map<string, Player>;
  clubOf: (key: string, name: string, active?: boolean) => string;
  onOpenMember: (key: string) => void;
  onOpenCard: (p: Player) => void;
}) => {
  const [classes, setClasses] = useState(CLASS_PAGE);
  const nextClass = hof.nextClass ?? Number(hof.classes.at(-1)?.season ?? 0) + 1;
  const now = nextClass - 1;

  const byClass = useMemo(() => {
    const m = new Map<string, GalleryItem[]>();
    for (const i of items) m.set(i.member.classSeason, [...(m.get(i.member.classSeason) ?? []), i]);
    return [...m.entries()]
      .sort((a, b) => Number(b[0]) - Number(a[0]))
      .map(([season, list]) => [season, [...list].sort((a, b) => b.member.score - a.member.score || b.member.careerLegacy - a.member.careerLegacy)] as const);
  }, [items]);

  const open = (e: Entry, active = false) => {
    const p = players.get(e.key);
    return p ? () => onOpenCard(p) : undefined;
  };
  const row = (e: Entry, note: ReactNode, active = false, chance?: number) => (
    <Row entry={e} club={clubOf(e.key, e.name, active)} note={note} bar={hof.bar} chance={chance} onOpen={open(e, active)} />
  );
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const NAV: [string, string][] = [['hof-canton', 'Canton'], ['hof-ballot', 'The ballot'], ['hof-soon', 'Eligible soon'], ['hof-snubs', 'Snubs'], ['hof-future', 'Future']];

  return (
    <>
      <header className="hof-hall mb-8 px-12 pb-5 pt-6 text-center sm:px-20 sm:pb-6 sm:pt-8">
        <span aria-hidden="true" className="hof-rays" />
        <span aria-hidden="true" className="hof-arch" />
        <span aria-hidden="true" className="hof-column hof-column--l" />
        <span aria-hidden="true" className="hof-column hof-column--r" />
        <span className="relative mx-auto grid h-14 w-14 place-items-center" aria-hidden="true">
          <Laurel size={56} color="hsl(43 90% 62%)" className="absolute inset-0" />
          <Crown className="relative h-5 w-5 text-gold" strokeWidth={2.2} />
        </span>
        <p className="mt-1 font-pixel text-[10px] uppercase tracking-[0.3em] text-gold">Canton, Ohio</p>
        <h1 className="mt-1 font-display text-[42px] font-extrabold uppercase italic leading-[0.95] text-chalk sm:text-6xl" style={{ textShadow: '3px 3px 0 #000' }}>
          Hall of <span className="hof-metal-text pr-1" style={{ textShadow: 'none' }}>Fame</span>
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground sm:text-base">
          The real Pro Football Hall of Fame: inductees whose careers started in 1970 or later, career totals from Wikipedia. {items.length} enshrined here, then the ballot, the snubs and the players on track.
        </p>
        <p className="mx-auto mt-2 max-w-lg text-xs text-muted-foreground">
          <span className="mr-1.5 inline-block rounded-sm bg-gold px-1.5 py-0.5 align-middle font-pixel text-[9px] uppercase text-night">Bar {hof.bar}</span>
          Hall of Fame Score: position standing, elite seasons, honours, records, longevity. Eligible five seasons after a last game.
        </p>
        <HofShowcase items={items} onOpen={(i) => i.player && onOpenCard(i.player)} />
        <nav aria-label="Sections" className="hof-floor -mx-12 -mb-5 mt-5 px-3 pb-3 pt-3.5 sm:-mx-20 sm:-mb-6 sm:px-6">
          <ol className="relative -mx-1 flex gap-2 overflow-x-auto px-1 pb-1.5 pt-0.5 scrollbar-none sm:justify-center">
            {NAV.map(([id, label]) => (
              <li key={id} className="shrink-0">
                <button type="button" className="hof-tag" onClick={() => go(id)}>
                  <span className="font-display text-sm font-extrabold uppercase leading-none">{label}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      </header>

      <section id="hof-canton" aria-labelledby="hof-canton-title" className="mb-10 scroll-mt-24">
        <HallHeading id="hof-canton-title" kicker={`Canton · ${items.length} enshrined`} title="The busts" sub="Newest class first. Careers before 1999 are career totals only (no season lines)." />
        {byClass.slice(0, classes).map(([season, list]) => (
          <div key={season} className="mb-6">
            <h3 className="mb-2 flex items-baseline gap-2 border-b border-line pb-1 font-display text-xl font-extrabold uppercase italic text-gold">
              Class of {season}
              <span className="font-pixel text-[9px] not-italic text-muted-foreground">{list.length} in our data</span>
            </h3>
            <ul className="grid grid-cols-2 gap-x-2.5 gap-y-4 pt-1 sm:grid-cols-3 sm:gap-x-3 lg:grid-cols-4 xl:grid-cols-5">
              {list.map((i, n) => {
                const stats = i.player ? careerLine(i.player).slice(0, 3) : [];
                const nfl = i.member.nfl;
                return (
                  <li key={i.member.key} className="min-w-0">
                    <GalleryTile item={i} index={n % 9} years={yearsOf(extras.stints[normalizeName(i.member.name)])} onOpen={onOpenMember} />
                    <p className="mt-1.5 px-0.5 text-[11px] leading-snug text-chalk/85">
                      {stats.map((s) => `${fmt(s.value)} ${s.label.toLowerCase()}`).join(' · ')}
                    </p>
                    {nfl?.partial && (
                      <p className="px-0.5 text-[10px] leading-snug text-gold/80">Stats from 1999{nfl.debut ? ` (debuted ${nfl.debut})` : ''}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <Pager total={byClass.length} shown={classes} onMore={() => setClasses(classes + CLASS_PAGE)} noun="classes" />
      </section>

      <Section
        id="hof-ballot"
        kicker={`The ballot · class of ${nextClass}`}
        title="Waiting at the door"
        sub={`Retired, eligible now (last played ${nextClass - 6} or earlier) and not in. Highest score first; the chance is a read-out of the score.`}
        count={hof.ballot.length}
        empty="Nobody is on the ballot."
      >
        <List
          rows={hof.ballot}
          noun="names"
          render={(e) => {
            const b = e as HofBallotEntry;
            const n = b.classesOnBallot ?? 0;
            return row(e, `last played ${b.lastSeason} · eligible since ${b.eligibleFrom}${n ? ` · ${n} class${n === 1 ? '' : 'es'} passed` : ' · first year'}`, false, b.chance);
          }}
        />
      </Section>

      <Section
        id="hof-soon"
        kicker="Not yet eligible"
        title="Eligible soon"
        sub="Retired within the last five seasons. A player is voted on five seasons after his last game."
        count={hof.soon.length}
        empty="Nobody is waiting out the five seasons."
      >
        <List
          rows={[...hof.soon].sort((a, b) => (a.eligibleFrom ?? 0) - (b.eligibleFrom ?? 0) || b.score - a.score)}
          noun="names"
          render={(e) => {
            const b = e as HofBallotEntry;
            return row(e, `last played ${b.lastSeason} · eligible for the class of ${b.eligibleFrom} (${yearsAway(b.eligibleFrom ?? now, now)})`, false, b.chance);
          }}
        />
      </Section>

      <Section
        id="hof-snubs"
        kicker="The debate"
        title="Snubs"
        sub={`Over the bar of ${hof.bar}, eligible for three classes or more, still not in.`}
        count={hof.snubs.length}
        empty="No snubs: everyone over the bar who has waited three classes is in."
      >
        <List
          rows={hof.snubs}
          noun="snubs"
          render={(e) => {
            const b = e as HofBallotEntry;
            return row(e, `${b.classesOnBallot} classes passed · last played ${b.lastSeason}`, false, b.chance);
          }}
        />
      </Section>

      <Section
        id="hof-future"
        kicker="The watch"
        title="Future Hall of Famers"
        sub={`Active players, their Hall of Fame Score today. ${hof.bar} and over is on track.`}
        count={hof.watch.length}
        empty="No active player is within reach of the bar yet."
      >
        <List rows={hof.watch} noun="players" render={(e) => row(e, e.score >= hof.bar ? 'on track · eligible five seasons after his last game' : 'building a case', true)} />
      </Section>
    </>
  );
};

export default NflHall;
