import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { Player } from '@/types/player';
import GameSprite from '@/components/GameSprite';
import { ChevronDown } from 'lucide-react';
import { InfoTip } from '@/components/ui/InfoTip';
import TeamLogo from '@/components/brand/TeamLogo';
import { Reveal, stag } from '@/components/motion/Reveal';
import { useTapPick } from '../stats/comps/graphs/graphKit';
import { cn } from '@/lib/utils';
import { boomN, f1, ord, pctOf, startN, TONE_LABEL, tierOfFinish, useFantasy, useFantasyRaw, type Fantasy, type FanRec } from '@/utils/fantasy';
import StatBoard, { Detail, type BoardTile } from './StatBoard';
import { onFantasyStat, statContext, takeFantasyStat } from './stats';
import { clubHue, NextLogos, TrendChip, teamOf, wk } from './parts';

const STAT_LABEL: Record<string, { k: string; unit: string }> = {
  og: { k: 'Opportunities / game', unit: '' }, ts: { k: 'Target share', unit: '%' }, ay: { k: 'Air yards share', unit: '%' },
  cs: { k: 'Carry share', unit: '%' }, sn: { k: 'Offence snaps', unit: '%' }, po: { k: 'PPR / opportunity', unit: '' },
};
const OPP_ORDER = ['og', 'ts', 'ay', 'cs', 'sn', 'po'] as const;
const OPP_INFO = 'Ranks are among players at his position with at least half their club\'s games. Red-zone touches and points over expectation are not in the weekly data, so they are not shown.';

/** One season of weekly PPR: bars coloured by weekly finish, the 25th to 75th percentile band, tap a bar for the game. */
const WeekChart = ({ f }: { f: Fantasy }) => {
  const { rec, pos } = f;
  const { picked, pick, boxProps } = useTapPick<number>();
  const byWeek = useMemo(() => new Map(rec.w.map((w) => [w[0], w])), [rec]);
  const weeks = Array.from({ length: f.week }, (_, i) => i + 1);
  const max = Math.max(10, ...rec.w.map((w) => w[1]), rec.ce ?? 0);
  const top = Math.ceil(max / 10) * 10;
  const grid = [0, 0.5, 1].map((x) => Math.round(top * x));
  const sel = picked != null ? byWeek.get(picked) : null;
  const pct = (v: number) => `${(Math.max(v, 0) / top) * 100}%`;
  return (
    <div className="fx-chart-box" {...boxProps}>
      <div className="fx-chart" role="list" aria-label="PPR by week">
        <div className="fx-grid" aria-hidden="true">
          {grid.map((g) => <span key={g} style={{ bottom: pct(g) }}><i>{g}</i></span>)}
          {rec.fl != null && rec.ce != null && <b className="fx-band" style={{ bottom: pct(rec.fl), height: `${((rec.ce - rec.fl) / top) * 100}%` }} />}
          {rec.md != null && <u className="fx-med" style={{ bottom: pct(rec.md) }} />}
        </div>
        {weeks.map((w) => {
          const l = byWeek.get(w);
          return (
            <div key={w} className="fx-col" role="listitem">
              {l ? (
                <button type="button" className={cn('fx-bar', `fx-bar--${tierOfFinish(pos, l[3])}`, picked === w && 'is-sel')} style={{ height: `max(3px, ${pct(l[1])})` }}
                  aria-label={`Week ${w} against ${l[2]}: ${l[1].toFixed(1)} PPR, ${pos}${l[3]} that week`} onClick={() => pick(picked === w ? null : w)} />
              ) : (
                <span className="fx-miss" title={w === f.bye ? 'Bye' : 'Did not play'}>{w === f.bye ? 'bye' : ''}</span>
              )}
              <span className="fx-wk">{w}</span>
            </div>
          );
        })}
      </div>
      <div className="fx-pick" aria-live="polite" style={{ '--tc': clubHue(f.club) } as CSSProperties}>
        {sel ? (
          <>
            {teamOf(sel[2]) && <TeamLogo team={teamOf(sel[2])} size={26} decorative backed />}
            <b>Week {sel[0]} · {sel[2]}</b>
            <span><em>PPR</em> {sel[1].toFixed(1)}</span>
            <span><em>Finish</em> {pos}{sel[3]}</span>
          </>
        ) : (
          <span className="fx-pick__hint">Tap a bar for the game</span>
        )}
      </div>
      <ul className="fx-legend">
        <li><i className="fx-dot fx-dot--boom" />Boom (top {boomN(pos)})</li>
        <li><i className="fx-dot fx-dot--start" />Start-worthy (top {startN(pos)})</li>
        <li><i className="fx-dot fx-dot--flat" />Flat</li>
        <li><i className="fx-dot fx-dot--bust" />Bust (past {startN(pos) * 1.5})</li>
        <li><i className="fx-dot fx-dot--band" />Middle half of his weeks</li>
      </ul>
    </div>
  );
};

const GameChips = ({ games, pos }: { games: FanRec['w']; pos: Fantasy['pos'] }) => (
  <ul className="fx-games">
    {games.map((g) => (
      <li key={g[0]} className={cn('fx-gm', `fx-gm--${tierOfFinish(pos, g[3])}`)} title={`Week ${g[0]} against ${g[2]}: ${pos}${g[3]} that week`}>
        <span className="fx-gm__w">W{g[0]}</span>
        {teamOf(g[2]) ? <TeamLogo team={teamOf(g[2])} size={20} decorative backed /> : <span>{g[2]}</span>}
        <b>{g[1].toFixed(1)}</b>
      </li>
    ))}
  </ul>
);

const avg = (g: FanRec['w']) => g.reduce((s, x) => s + x[1], 0) / (g.length || 1);

const dateOf = (d?: string) => {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const Windows = ({ f, open, onOpen }: { f: Fantasy; open: string | null; onOpen: (id: string | null) => void }) => {
  const { rec, pos } = f;
  const raw = useFantasyRaw();
  const last = rec.w.slice(-3);
  const prev = rec.w.slice(-6, -3);
  const l3 = open === 'l3' && raw ? statContext(raw, f.key, 'l3') : null;
  return (
    <div className="fx-win">
      {last.length === 3 && (
        <div className="fx-panel rbk-chip mo-rise" id="fx-stat-l3" style={stag(0)}>
          <button type="button" className="fx-panel__btn" aria-expanded={open === 'l3'} onClick={() => onOpen(open === 'l3' ? null : 'l3')}>
            <span className="fx-k">Last 3 games</span><TrendChip trend={f.trend} /><ChevronDown className="fx-tile__c" aria-hidden="true" />
          </button>
          <div className="fx-panel__v"><b>{f1(avg(last))}</b><i>PPR / game</i></div>
          <GameChips games={last} pos={pos} />
          <em className="fx-panel__s">{rec.l3r ? `${ord(rec.l3r[0])} of ${rec.l3r[1]} ${pos}s` : ' '}</em>
          {l3 && <div className="fx-det fx-det--in dd-enter"><Detail ctx={l3} pos={pos} /></div>}
        </div>
      )}
      {prev.length === 3 && (
        <div className="fx-panel mo-rise" style={stag(1)}>
          <div className="fx-panel__h"><span className="fx-k">The 3 before</span></div>
          <div className="fx-panel__v"><b>{f1(avg(prev))}</b><i>PPR / game</i></div>
          <GameChips games={prev} pos={pos} />
          <em className="fx-panel__s">{f.trend ? `Last 3: ${f.trend.delta >= 0 ? '+' : ''}${f.trend.delta.toFixed(1)}` : ' '}</em>
        </div>
      )}
      {f.next.length > 0 && (
        <div className="fx-panel fx-panel--next mo-rise" id="fx-next" style={stag(2)}>
          <div className="fx-panel__h"><span className="fx-k">Next 3 games</span><InfoTip label="About matchups">Rank 1 = the softest of 32 defences against {pos}s: the one allowing the most PPR a game to them.</InfoTip></div>
          <ul className="fx-mu">
            {f.next.map((s) => {
              const t = s.opp ? teamOf(s.opp) : null;
              return (
                <li key={s.week} className={cn('fx-mu__r', s.tone && `fx-mu__r--${s.tone}`)} style={t ? ({ '--oc': `hsl(${t.primaryColor})` } as CSSProperties) : undefined}>
                  {t && <TeamLogo team={t} size={64} decorative className="fx-mu__wm" />}
                  <span className="fx-mu__w">W{s.week}</span>
                  {s.opp ? (
                    <>
                      <TeamLogo team={t ?? s.opp} size={30} decorative backed />
                      <span className="fx-mu__o"><b>{s.home ? 'vs' : 'at'} {t?.name ?? s.opp}</b><em>{s.home ? 'Home' : 'Away'}{s.date ? ` · ${dateOf(s.date)}` : ''} · allows {f1(s.allowed)}</em></span>
                      <span className="fx-mu__t"><b>{s.rank ? ord(s.rank) : '—'}</b><em>{s.tone ? TONE_LABEL[s.tone] : ''}</em></span>
                    </>
                  ) : (
                    <span className="fx-mu__o"><b>Bye week</b></span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

/** The Deep Dive's Fantasy section (active QB, RB, WR, TE with a game this season). */
const FantasySection = ({ playerKey, active, player }: { playerKey: string; active: boolean; player?: Player }) => {
  const f = useFantasy(active ? playerKey : null);
  const [open, setOpen] = useState<string | null>(null);
  const live = !!f;
  useEffect(() => {
    if (!live) return;
    const go = (id: string) => {
      if (id !== 'next') setOpen(id);
      window.setTimeout(() => document.getElementById(id === 'next' ? 'fx-next' : `fx-stat-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 450);
    };
    const p = takeFantasyStat();
    if (p) go(p);
    return onFantasyStat(go);
  }, [live]);
  if (!f) return null;
  const { rec, pos } = f;
  const op = rec.op ?? {};
  const opps = OPP_ORDER.filter((k) => op[k]);
  const few = rec.g < 4;
  const hero: BoardTile[] = [
    { id: 'ppr', k: 'PPR total', num: { value: rec.t, decimals: 1 }, sub: `${rec.g} games · week ${f.week}`, tone: 'lead' },
    { id: 'pg', k: 'PPR / game', num: { value: rec.pg, decimals: 1 }, sub: rec.rk[4] ? `${ord(rec.rk[4])} of ${rec.rk[5]} ${pos}s` : 'Few games' },
    { id: 'rank', k: `${pos} rank`, v: ord(rec.rk[0]), sub: `of ${rec.rk[1]}` },
    { id: 'overall', k: 'Overall rank', v: ord(rec.rk[2]), sub: `of ${rec.rk[3]}` },
  ];
  const cons: BoardTile[] = [
    { id: 'fl', k: 'Floor', num: { value: rec.fl ?? 0, decimals: 1 }, sub: '25th percentile' },
    { id: 'md', k: 'Median', num: { value: rec.md ?? 0, decimals: 1 } },
    { id: 'ce', k: 'Ceiling', num: { value: rec.ce ?? 0, decimals: 1 }, sub: '75th percentile' },
    { id: 'sd', k: 'Std dev', num: { value: rec.sd ?? 0, decimals: 1 }, sub: rec.cv != null ? `CV ${rec.cv.toFixed(2)}` : undefined },
    { id: 'sw', k: 'Start-worthy', num: { value: pctOf(rec.sw, rec.g), suffix: '%' }, sub: `${rec.sw} of ${rec.g} ${wk(rec.g)}`, tone: 'good' },
    { id: 'bm', k: 'Boom', num: { value: pctOf(rec.bm, rec.g), suffix: '%' }, sub: `${rec.bm} ${wk(rec.bm)}` },
    { id: 'bu', k: 'Bust', num: { value: pctOf(rec.bu, rec.g), suffix: '%' }, sub: `${rec.bu} ${wk(rec.bu)}`, tone: rec.bu ? 'bad' : undefined },
  ];
  const oppTiles: BoardTile[] = opps.map((k) => {
    const s = op[k]!;
    const def = STAT_LABEL[k];
    return { id: k, k: def.k, v: `${k === 'po' ? s[0].toFixed(2) : s[0].toFixed(1)}${def.unit}`, sub: s[1] ? `${ord(s[1])} of ${s[2]} ${pos}s` : undefined };
  });
  return (
    <Reveal className="fx" style={{ '--tc': clubHue(f.club) } as CSSProperties}>
      <div className="fx-top">
        {player && (
          <div className="fx-stage" aria-hidden="true">
            <div className="fx-stage__turf" />
            <div className="fx-stage__sprite"><GameSprite player={player} kind="figure" size="m" showKit /></div>
            {teamOf(f.club) && <TeamLogo team={teamOf(f.club)} size={44} decorative backed className="fx-stage__logo" />}
          </div>
        )}
        <StatBoard tiles={hero} playerKey={playerKey} pos={pos} open={open} onOpen={setOpen} className="fx-hero" />
      </div>

      <div className="fx-block mo-rise" style={stag(4)}>
        <div className="fx-block__h">
          <span className="fx-k">Week by week · {f.season}</span>
          <InfoTip label="About the weekly chart">
            Each bar is a game in standard PPR; a bye or a missed game is a gap. Colours follow his weekly finish among every {pos} with a line that
            week: boom is the top {boomN(pos)}, start-worthy the top {startN(pos)}, bust worse than {startN(pos) * 1.5}. The shaded band is the middle half of
            his weeks, the line the median.
          </InfoTip>
        </div>
        <WeekChart f={f} />
      </div>

      <Windows f={f} open={open} onOpen={setOpen} />

      {!few && rec.sd != null && (
        <div className="fx-block mo-rise" style={stag(5)}>
          <div className="fx-block__h"><span className="fx-k">Consistency</span></div>
          <StatBoard grid tiles={cons} playerKey={playerKey} pos={pos} open={open} onOpen={setOpen} />
        </div>
      )}

      {oppTiles.length > 0 && (
        <div className="fx-block mo-rise" style={stag(6)}>
          <div className="fx-block__h">
            <span className="fx-k">Opportunity</span>
            <InfoTip label="About opportunity">{OPP_INFO}</InfoTip>
          </div>
          <StatBoard grid tiles={oppTiles} playerKey={playerKey} pos={pos} open={open} onOpen={setOpen} />
        </div>
      )}
    </Reveal>
  );
};

export default FantasySection;
export { NextLogos };
