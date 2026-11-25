import { useDeferredValue, useMemo, useState } from 'react';
import { Ban, Dices, Eraser, FastForward, Lock, LockOpen, Plus, Wallet } from 'lucide-react';
import { ArcadeToggle } from '@/components/arcade';
import TeamLogo from '@/components/brand/TeamLogo';
import { InfoTip } from '@/components/ui/InfoTip';
import { Input } from '@/components/ui/input';
import { Reveal, stag, ViewCount } from '@/components/motion/Reveal';
import { useFieldArt } from '@/components/teamlab/fieldArt';
import NflSaved from '@/components/teamlab/nfl/NflSaved';
import { useMedia } from '@/components/teamlab/useMedia';
import type { Prefs } from '@/components/teamlab/nfl/useNflLab';
import type { Turf } from '@/components/teamlab/fieldArt';
import { cn } from '@/lib/utils';
import { fantasySpot } from '@/utils/nflLab';
import { bannerTeamOf } from '@/utils/playerExtras';
import { fantasyFrom, useFantasyRaw } from '@/utils/fantasy';
import { canDraft, DRAFT_ROUNDS, F_SLOTS, fFilled, onClock, projectWeek, salaryOf, teamPicks, type Cand } from '@/utils/nflFantasy';
import { findNFLTeam } from '@/utils/nflTeams';
import type { InjuryCode } from '@/utils/injuries';
import FantasyField, { type FSpot } from './FantasyField';
import SlotPicker from './SlotPicker';
import { ClubMark } from '@/components/fantasy/ClubMark';
import { NameStrip, PlayerHit, Sprite, hcVars } from './hubParts';
import { useOpenCard } from './cardContext';
import { f1, isBenchId, nameOf, type FantasyHub } from './useFantasyHub';
import BenchRow from './BenchRow';
import type { FPos } from '@/utils/fantasy';
import { teamOf } from '../parts';

const InjMini = ({ code }: { code: InjuryCode }) => <span className={`nfl-injchip nfl-injchip--${code.toLowerCase()}`}>{code === 'Questionable' ? 'Q' : code === 'Doubtful' ? 'Dbt' : code}</span>;

const POS_OPTS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'DST'] as const;

/** Lineup: the field with your players, the slot plates, then the board, the draft and saved lineups. */
const LineupPage = ({ hub, prefs, setPrefs, turf }: { hub: FantasyHub; prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void; turf: Turf }) => {
  const { ctx, lab, injured, fl, locks, excludes, setExcludes, fctx, cands, board, cap, capMode, week, filled, cost, draft, setDraft, clubName } = hub;
  const raw = useFantasyRaw();
  const open = useOpenCard();
  const tall = useMedia('(max-width: 639px)');
  const art = useFieldArt(clubName, turf, tall);
  const [pick, setPick] = useState<string | null>(null);
  const slot = F_SLOTS.find((s) => s.id === pick) ?? (pick && isBenchId(pick) ? { id: pick, label: 'a bench player', positions: ['QB', 'RB', 'WR', 'TE'] as FPos[] } : null);
  const proj = (k: string) => (fctx ? projectWeek(fctx, k, week) : 0);

  const spots: FSpot[] = F_SLOTS.map((s) => {
    const k = fl[s.id];
    const at = fantasySpot(s.id, tall);
    const prof = k && !k.startsWith('DST:') ? ctx.profiles.get(k) : undefined;
    const bye = !!k && !!hub.sched && !!lab && hub.isBye(hub.sched, k.startsWith('DST:') ? k.slice(4) : lab.p[k]?.t ?? '', week);
    return {
      id: s.id, x: at.x, y: at.y, label: s.label, profile: prof,
      dst: k?.startsWith('DST:') ? k.slice(4) : undefined,
      injury: k ? injured.get(k) : undefined,
      badge: k ? (bye ? 'BYE' : capMode ? `$${salaryOf(lab!, k)}` : f1(proj(k))) : undefined,
      slots: prof ? fantasyFrom(raw, k)?.next : undefined,
    };
  });
  // the board filters on the deferred text: a keystroke paints the box first, the 40 rows follow
  const dq = useDeferredValue(hub.query);
  const shown = useMemo(() => {
    const q = dq.trim().toLowerCase();
    return board
      .filter((c) => (hub.posFilter === 'ALL' || c.pos === hub.posFilter) && !excludes.has(c.key) && (!draft || prefs.fmode !== 'draft' || !hub.draftTaken.has(c.key)) && (!q || nameOf(c.key).toLowerCase().includes(q)))
      .slice(0, 40);
  }, [board, hub.posFilter, dq, excludes, draft, hub.draftTaken, prefs.fmode]);
  const max = Math.max(1, ...shown.map((c) => c.value));

  return (
    <div className="fh-page">
      <div className="fh-actions">
        <ArcadeToggle<Prefs['fmode']> label="Lineup mode" size="sm" value={prefs.fmode} onChange={(v) => setPrefs({ fmode: v })} options={[{ value: 'free', label: 'Free pick' }, { value: 'cap', label: 'Salary cap' }, { value: 'draft', label: 'Draft' }]} />
        {prefs.fmode !== 'draft' ? (
          <button type="button" className="fh-btn fh-btn--go" onClick={hub.build} disabled={!cands.length} title="Best projected lineup for the next four weeks, honouring locks and removed players">
            <Wallet className="h-4 w-4" aria-hidden="true" /> {capMode ? `Build under ${cap}` : 'Best lineup'}
          </button>
        ) : (
          <>
            <button type="button" className="fh-btn fh-btn--go" onClick={hub.startDraft}><Dices className="h-4 w-4" aria-hidden="true" /> {draft ? 'Redraft' : 'Start the draft'}</button>
            {hub.drafting && <button type="button" className="fh-btn" onClick={hub.simToEnd}><FastForward className="h-4 w-4" aria-hidden="true" /> Auto-finish</button>}
          </>
        )}
        {(filled > 0 || excludes.size > 0) && (
          <button type="button" className="fh-btn fh-btn--ghost" aria-label="Clear the lineup" title="Clear" onClick={() => { hub.clearStarters(); hub.setLocks({}); setExcludes(new Set()); setDraft(null); }}>
            <Eraser className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="fh-pitch">
        <Reveal className="fh-fieldwrap">
          <FantasyField onOpen={open} spots={spots} kitClub={clubName} turf={turf} art={art} tall={tall} size={tall ? 's' : 'm'} onPick={setPick} />
        </Reveal>
        <section className="fh-slots" aria-label="Lineup slots">
          <header className="fh-slots__h">
            <h2>Lineup</h2>
            <span className="fh-lamp" aria-label={`${filled} of 8 slots filled`}><b>{filled}</b>/8</span>
          </header>
          <ul>
            {F_SLOTS.map((s, i) => {
              const k = fl[s.id] ?? '';
              const prof = k && !k.startsWith('DST:') ? ctx.profiles.get(k) : undefined;
              const dst = k.startsWith('DST:') ? k.slice(4) : '';
              const club = prof ? bannerTeamOf(prof.player) : dst;
              const f = prof ? fantasyFrom(raw, k) : null;
              return (
                <li key={s.id} id={`fh-slot-${s.id}`} className={cn('fh-slot ix-card', k ? 'is-filled fx-flat' : 'is-empty')} style={{ ...hcVars(club || undefined), ...stag(i, 50) }}>
                  {k && club && <ClubMark club={club} size={96} />}
                  <span className="fh-slot__pos">{s.label}</span>
                  {k ? (
                    <>
                      <span className="fh-slot__fig">{prof ? <PlayerHit pkey={k}><Sprite player={prof.player} club={findNFLTeam(club)?.name} /></PlayerHit> : <TeamLogo team={dst} size={34} decorative backed />}</span>
                      <span className="fh-slot__who">
                        {prof ? <NameStrip pkey={k} name={nameOf(k)} club={club} extra={injured.get(k) ? <InjMini code={injured.get(k)!} /> : undefined} /> : <b className="fh-slot__dst">{nameOf(k)}</b>}
                        {f && <span className="fh-slot__opp"><OppInline f={f} /></span>}
                      </span>
                      <span className="fh-slot__n"><b>{f1(proj(k))}</b><i>{capMode && lab ? `$${salaryOf(lab, k)}` : 'proj'}</i></span>
                      {capMode && (
                        <button type="button" className={cn('fh-icon', locks[s.id] && 'is-on')} onClick={() => hub.toggleLock(s.id)} aria-pressed={!!locks[s.id]} aria-label={locks[s.id] ? `Unlock ${s.label}` : `Lock ${s.label}`}>
                          {locks[s.id] ? <Lock className="h-4 w-4" aria-hidden="true" /> : <LockOpen className="h-4 w-4" aria-hidden="true" />}
                        </button>
                      )}
                      <button type="button" className="fh-swap" onClick={() => setPick(s.id)}>Change</button>
                    </>
                  ) : (
                    <button type="button" className="fh-slot__empty" onClick={() => setPick(s.id)}>
                      <Plus className="h-4 w-4" aria-hidden="true" /> Add {s.id === 'dst' ? 'a defence' : s.label}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {capMode && (
            <div className="fh-cap" aria-label={`Payroll ${cost} of ${cap}`}>
              <span className="fh-cap__bar"><i className={cn(cost > cap && 'over')} style={{ width: `${Math.min(100, (cost / cap) * 100)}%` }} /></span>
              <span className={cn('fh-cap__t', cost > cap && 'is-over')}><ViewCount value={cost} prefix="$" /> of ${cap} · {cost > cap ? `$${cost - cap} over` : `$${cap - cost} room`}</span>
            </div>
          )}
        </section>
      </div>

      <BenchRow hub={hub} onPick={setPick} />

      {prefs.fmode === 'draft' && <DraftBoard hub={hub} />}

      <section className="fh-panel" aria-labelledby="fh-board-h">
        <header className="fh-panel__h">
          <h2 id="fh-board-h">{prefs.fmode === 'draft' ? 'Draft board' : 'Players board'}</h2>
          <InfoTip label="About the board">Projection from his last 12 games, recent games weighted heavier, times how the opponent defends his position, with injury reports and byes applied.</InfoTip>
          <Input value={hub.query} onChange={(e) => hub.setQuery(e.target.value)} placeholder="Search" aria-label="Search players" className="fh-search" />
        </header>
        <ArcadeToggle<(typeof POS_OPTS)[number]> label="Position" size="sm" value={hub.posFilter} onChange={hub.setPosFilter} options={POS_OPTS.map((p) => ({ value: p, label: p === 'DST' ? 'D/ST' : p === 'ALL' ? 'All' : p }))} />
        <ol className="fh-board">
          {shown.map((c, i) => (
            <BoardRow key={c.key} c={c} i={i} max={max} week={week} fh={hub} prefs={prefs} inLineup={Object.values(fl).includes(c.key)} inj={injured.get(c.key)} />
          ))}
        </ol>
        {excludes.size > 0 && <button type="button" className="fh-link" onClick={() => setExcludes(new Set())}>Restore {excludes.size} removed</button>}
      </section>

      <NflSaved
        kind="fantasy"
        list={hub.saved.list}
        canSave={filled > 0}
        onSave={(name) => hub.saved.add({ name, kind: 'fantasy', lineup: fl })}
        onLoad={(s) => s.kind === 'fantasy' && hub.loadLineup(s.lineup)}
        onRename={hub.saved.rename}
        onDelete={hub.saved.remove}
        summary={(s) => (s.kind === 'fantasy' && fctx ? `${f1(hub.total(s.lineup, week))} proj · ${fFilled(s.lineup)}/8` : '')}
      />
      <SlotPicker hub={hub} slot={slot} onClose={() => setPick(null)} />
    </div>
  );
};

const OppInline = ({ f }: { f: NonNullable<ReturnType<typeof fantasyFrom>> }) => {
  const s = f.next[0];
  if (!s) return null;
  const t = s.opp ? teamOf(s.opp) : null;
  return (
    <span className={cn('fh-opp-pill', s.tone && `is-${s.tone}`)} title={s.opp ? `Week ${s.week} ${s.home ? 'vs' : 'at'} ${t?.fullName ?? s.opp}` : `Week ${s.week}: bye`}>
      {s.opp ? <><TeamLogo team={t ?? s.opp} size={14} decorative backed />{s.home ? 'vs' : '@'} {s.opp}</> : 'BYE'}
    </span>
  );
};

const BoardRow = ({ c, i, max, week, fh, prefs, inLineup, inj }: { c: Cand; i: number; max: number; week: number; fh: FantasyHub; prefs: Prefs; inLineup: boolean; inj?: InjuryCode }) => {
  const open = useOpenCard();
  const prof = c.pos === 'DST' ? undefined : fh.ctx.profiles.get(c.key);
  const club = findNFLTeam(c.club)?.name;
  return (
    <li className={cn('fh-brow ix-card fx-flat fx-row', inLineup && 'is-in')} style={{ ...hcVars(club), ...stag(Math.min(i, 8), 30) }}>
      <ClubMark club={club ?? c.club} size={80} />
      <span className="fh-brow__rank">{i + 1}</span>
      <span className="fh-brow__fig">{prof ? <PlayerHit pkey={c.key}><Sprite player={prof.player} club={club} /></PlayerHit> : <TeamLogo team={c.club} size={30} decorative backed />}</span>
      <span className="fh-brow__who">
        {prof ? <NameStrip pkey={c.key} name={nameOf(c.key)} club={club} extra={inj ? <InjMini code={inj} /> : undefined} /> : <b className="fh-slot__dst">{nameOf(c.key)}</b>}
        <i>{c.pos === 'DST' ? 'D/ST' : c.pos}</i>
      </span>
      <span className="fh-brow__n"><b>{f1(fh.fctx ? projectWeek(fh.fctx, c.key, week) : 0)}</b><i>Wk {week}</i></span>
      <span className="fh-brow__n fh-brow__n--sm"><b>{f1(c.value)}</b><i>Next 4</i></span>
      <span className="fh-brow__n fh-brow__n--sm"><b>${c.salary}</b><i>{c.salary ? (c.value / c.salary).toFixed(2) : '—'} /$</i></span>
      <span className="fh-brow__bar" aria-hidden="true"><i style={{ width: `${(c.value / max) * 100}%` }} /></span>
      <span className="fh-brow__act">
        {prefs.fmode === 'draft' ? (
          <button type="button" className="fh-btn fh-btn--sm" disabled={!fh.myTurn || !fh.draft || !canDraft(fh.draft, fh.draft.me, c.key)} onClick={() => fh.draftPick(c.key)}>Draft</button>
        ) : (
          <>
            <button type="button" className="fh-icon" onClick={() => fh.place(c.key)} disabled={inLineup} aria-label={`Add ${nameOf(c.key)}`}><Plus className="h-4 w-4" aria-hidden="true" /></button>
            <button type="button" className="fh-icon fh-icon--x" onClick={() => fh.exclude(c.key)} aria-label={`Remove ${nameOf(c.key)} from the pool`} title="Remove from the pool (the builder skips him)"><Ban className="h-4 w-4" aria-hidden="true" /></button>
          </>
        )}
      </span>
      <button type="button" className="fh-brow__open" onClick={() => open(c.key)} aria-label={`Open ${nameOf(c.key)}'s card`} tabIndex={-1} data-player-key={c.pos === 'DST' ? undefined : c.key} />
    </li>
  );
};

/** The draft as a board: who is on the clock, your picks as plates, the latest picks. */
const DraftBoard = ({ hub }: { hub: FantasyHub }) => {
  const { draft, myTurn } = hub;
  if (!draft)
    return (
      <section className="fh-panel fh-draft"><header className="fh-panel__h"><h2>Snake draft</h2></header><p className="fh-muted">Eight owners, {DRAFT_ROUNDS} rounds. Start the draft to pick against seven computer owners.</p></section>
    );
  const clock = onClock(draft);
  const round = Math.floor(draft.picks.length / draft.teams) + 1;
  const mine = teamPicks(draft, draft.me);
  return (
    <section className="fh-panel fh-draft" aria-label="Snake draft">
      <header className="fh-panel__h"><h2>Snake draft</h2><span className={cn('fh-clock', myTurn && 'is-me')} role="status">{clock == null ? 'Complete' : myTurn ? `Your pick · rd ${Math.min(DRAFT_ROUNDS, round)}` : `Team ${clock + 1} on the clock`}</span></header>
      <div className="fh-draft__g">
        <div><span className="fh-set__k">Your picks {mine.length}/{DRAFT_ROUNDS}</span><ol className="fh-picks">{mine.map((k, i) => <li key={k} className="mo-pop" style={stag(i, 40)}><b>{i + 1}</b>{nameOf(k)}</li>)}</ol></div>
        <div><span className="fh-set__k">Latest picks</span><ol className="fh-picks fh-picks--log">{draft.picks.slice(-6).reverse().map((p, i) => <li key={`${p.key}-${i}`} className={cn(p.team === draft.me && 'is-me')}><b>T{p.team + 1}</b>{nameOf(p.key)}</li>)}</ol></div>
      </div>
    </section>
  );
};

export default LineupPage;
