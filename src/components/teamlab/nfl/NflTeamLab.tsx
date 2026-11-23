import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Dices, Eraser, Plane, Shirt, Sparkles, Sun, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import TeamLogo from '@/components/brand/TeamLogo';
import PixelLoader from '@/components/ui/PixelLoader';
import { cn } from '@/lib/utils';
import { findNFLTeam, NFL_TEAMS } from '@/utils/nflTeams';
import { bannerTeamOf } from '@/utils/playerExtras';
import {
  RATING_SOURCES,
  activeSlots,
  autoDraftN,
  clubAbbr,
  emptyNLineup,
  filledN,
  isCompleteN,
  keysOf,
  loadClub,
  randomN,
  reformN,
  scoreN,
  setSlotN,
  spotOf,
  type DefForm,
  type NLineup,
  type OffForm,
  type RatingSource,
  type Skipped,
  DEF_FORMS,
  OFF_FORMS,
} from '@/utils/nflLab';
import { ModeSwitch, ClubSelect, TurfSelect, Stands, openPicker, useStage } from './NflShared';
import NflField, { type FieldItem } from './NflField';
import { NflDepthChart } from './NflDepthChart';
import NflHeader from './NflHeader';
import { NflH2H, NflReport } from './NflReport';
import NflSaved from './NflSaved';
import FantasyMode from './FantasyMode';
import { useNflLab, usePrefs, useSavedLabs, type NflLabReady } from './useNflLab';
import '../teamlab.css';
import './nflLab.css';

/**
 * Team Lab, NFL edition (#lab): real 11-man lineups on the game's field in a club's kit (that club's real current
 * starters from the nflverse depth charts, or any players), the same "vs random lineups" grades, a call sheet and a
 * head-to-head with real matchup numbers. The mode switch folds fantasy in (FantasyMode.tsx) with the same field.
 * Engine: utils/nflLab.ts (team) and utils/nflFantasy.ts (fantasy); data: scripts/nfl/depth_charts.py, lab_data.py.
 */

const TeamMode = ({ nl, prefs, setPrefs, onMode }: { nl: NflLabReady; prefs: ReturnType<typeof usePrefs>[0]; setPrefs: ReturnType<typeof usePrefs>[1]; onMode: (m: 'team' | 'fantasy') => void }) => {
  const { ctx, data, injured } = nl;
  const saved = useSavedLabs();
  const [lineup, setLineup] = useState<NLineup>(() => emptyNLineup());
  const [loaded, setLoaded] = useState<{ club: string; skipped: Skipped[]; filled: string[] } | null>(null);
  const [anyPlayer, setAnyPlayer] = useState(false);
  const [src, setSrc] = useState<RatingSource>('ovr');
  const [kit, setKit] = useState('');
  const auto = useRef(false);
  const depth = data?.depth ?? null;
  const lab = data?.lab ?? null;

  const clubTeam = findNFLTeam(prefs.club);
  const clubName = clubTeam?.name ?? prefs.club;
  const load = useCallback(
    (club: string, off: OffForm, def: DefForm | null) => {
      if (!depth) return;
      const r = loadClub(ctx, depth, club, off, def, injured);
      if (!r) return;
      setLineup(r.lineup);
      setLoaded({ club, skipped: r.skipped, filled: r.filled });
      setKit('');
    },
    [ctx, depth, injured],
  );
  // The first visit opens on the chosen club's real starters
  useEffect(() => {
    if (auto.current || !depth || !data?.lab) return;
    auto.current = true;
    load(prefs.club, '11', null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the data lands
  }, [depth, data]);

  const autoKit = useMemo(() => {
    const count = new Map<string, number>();
    keysOf(lineup).forEach((k) => {
      const p = ctx.profiles.get(k);
      const t = p ? findNFLTeam(bannerTeamOf(p.player))?.name : undefined;
      if (t) count.set(t, (count.get(t) ?? 0) + 1);
    });
    const best = Math.max(0, ...count.values());
    if (!best) return clubName;
    const top = [...count.entries()].filter(([, n]) => n === best).map(([t]) => t);
    return top.includes(clubName) ? clubName : top.sort()[0];
  }, [ctx, lineup, clubName]);
  const kitClub = kit || autoKit;
  const stage = useStage(kitClub);
  const score = useMemo(() => (isCompleteN(lineup) ? scoreN(ctx, lineup, src, false) : null), [ctx, lineup, src]);
  const filled = filledN(lineup);
  const items: FieldItem[] = activeSlots(lineup).map((s) => {
    const k = lineup.s[s.id];
    const at = spotOf(lineup, s.id, stage.tall);
    return { id: s.id, x: at.x, y: at.y, label: s.label, profile: k ? ctx.profiles.get(k) : undefined, injury: k ? injured.get(k) : undefined };
  });
  const setForms = (off: OffForm, def: DefForm) => {
    if (loaded && depth && filled >= 20) load(loaded.club, off, def);
    else setLineup((l) => reformN(l, off, def));
  };
  const poolClub = anyPlayer ? '' : loaded?.club ?? '';
  const stepAside = loaded?.skipped ?? [];

  return (
    <div className="lab nfl-lab rv-load-in container min-w-0 py-3 sm:py-4" style={stage.vars}>
      <div className="lab-stadium">
        <NflHeader
          kitClub={kitClub}
          kicker="Team Lab"
          title={
            <>
              {loaded && depth ? `${clubTeam?.name ?? ''} ` : 'Team '}
              <span className="text-gold">{loaded ? 'starters' : 'Lab'}</span>
            </>
          }
          sub={
            filled === 0
              ? 'Load a club’s real starters, or build any 22: 11 on offense and 11 on defense, graded against random lineups.'
              : isCompleteN(lineup)
                ? `${loaded ? `${clubTeam?.fullName}${clubTeam?.fullName.endsWith('s') ? "'" : "'s"} depth chart as of ${depth?.at ?? 'now'}` : 'Your lineup'}${stepAside.length ? `; ${stepAside.length} injured starter${stepAside.length === 1 ? '' : 's'} stepped aside` : ''}.`
                : `${filled} of 22 on the field. The full report appears when all 22 are in.`
          }
          leds={[
            { label: 'Team', grade: score?.team.grade, value: score ? Math.round(score.team.score) : undefined },
            { label: 'Offense', grade: score?.offense.grade, value: score ? Math.round(score.offense.score) : undefined },
            { label: 'Defense', grade: score?.defense.grade, value: score ? Math.round(score.defense.score) : undefined },
            { label: 'Formation', value: `${lineup.off}·${lineup.def}`, game: true, title: 'Offensive personnel and base defense' },
          ]}
        >
          <div className="lab-toolbar nfl-toolbar">
            <ModeSwitch mode="team" onMode={onMode} />
            <ClubSelect value={prefs.club} onChange={(c) => setPrefs({ club: c })} />
            <Button type="button" size="sm" onClick={() => load(prefs.club, lineup.off, null)} disabled={!depth} className="bg-gold font-display text-[15px] font-bold uppercase text-black hover:bg-gold/90" title="That club's depth chart now, injured starters stepping aside">
              <Plane className="mr-1 h-4 w-4" aria-hidden="true" /> Load {clubName}
            </Button>
            <Select value={lineup.off} onValueChange={(v) => setForms(v as OffForm, lineup.def)}>
              <SelectTrigger className="lab-btn h-9 w-auto min-w-[7.5rem]" aria-label="Offensive personnel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[70]">
                {OFF_FORMS.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.label} <span className="text-muted-foreground">· {f.note}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={lineup.def} onValueChange={(v) => setForms(lineup.off, v as DefForm)}>
              <SelectTrigger className="lab-btn h-9 w-auto min-w-[7.5rem]" aria-label="Base defense">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[70]">
                {DEF_FORMS.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.label} <span className="text-muted-foreground">· {f.note}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" size="sm" variant="outline" className="lab-btn" onClick={() => { setLineup(autoDraftN(ctx, lineup.off, lineup.def, src)); setLoaded(null); }} title="Best rating at every slot, then swaps that raise the team grade">
              <Sparkles className="mr-1 h-4 w-4" aria-hidden="true" /> Dream team
            </Button>
            <Button type="button" size="sm" variant="outline" className="lab-btn" onClick={() => { setLineup(randomN(ctx, lineup.off, lineup.def, Math.floor(Math.random() * 1e9))); setLoaded(null); }}>
              <Dices className="mr-1 h-4 w-4" aria-hidden="true" /> Random
            </Button>
            <button type="button" className={cn('nfl-pill', anyPlayer && 'is-on')} onClick={() => setAnyPlayer((v) => !v)} aria-pressed={anyPlayer} title="Pickers list any player (past and present) instead of the loaded club's roster">
              <Users className="h-4 w-4" aria-hidden="true" /> Any player
            </button>
            <div className="nfl-seg nfl-seg--sm" role="group" aria-label="Rating source">
              {RATING_SOURCES.map((r) => (
                <button key={r.id} type="button" disabled={!r.ready} title={r.note} className={cn('nfl-seg-btn', src === r.id && 'is-on')} onClick={() => r.ready && setSrc(r.id)} aria-pressed={src === r.id}>
                  {r.label}
                </button>
              ))}
            </div>
            <Select value={kit || 'auto'} onValueChange={(v) => setKit(v === 'auto' ? '' : v)}>
              <SelectTrigger className="lab-btn h-9 w-auto min-w-[9rem]" aria-label="Kits the lineup wears">
                <Shirt className="mr-1 h-4 w-4 shrink-0" aria-hidden="true" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[70] max-h-80">
                <SelectItem value="auto">Kit: auto ({autoKit})</SelectItem>
                {[...NFL_TEAMS].sort((a, b) => a.name.localeCompare(b.name)).map((t) => (
                  <SelectItem key={t.id} value={t.name}>
                    <span className="inline-flex items-center gap-2"><TeamLogo team={t} size={16} decorative /> {t.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <TurfSelect turf={stage.turf} onTurf={stage.setTurf} />
            {filled > 0 && (
              <Button type="button" size="sm" variant="ghost" onClick={() => { setLineup((l) => emptyNLineup(l.off, l.def)); setLoaded(null); }} className="font-display text-[15px] font-bold uppercase text-muted-foreground">
                <Eraser className="mr-1 h-4 w-4" aria-hidden="true" /> Clear
              </Button>
            )}
          </div>
        </NflHeader>
        <Stands art={stage.art} />
        <div className="lab-pitch">
          <NflField
            items={items}
            kitClub={kitClub}
            turf={stage.turf}
            art={stage.art}
            tall={stage.tall}
            size="s"
            onPick={openPicker}
            overlay={
              !depth || !lab ? (
                <div className="lab-cta"><PixelLoader size="sm" label="Depth chart" what="the depth charts" /></div>
              ) : filled === 0 ? (
                <div className="lab-cta">
                  <p className="lab-kicker">Empty field</p>
                  <p className="lab-cta-title">Scout a real lineup</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button type="button" onClick={() => load(prefs.club, lineup.off, null)} className="bg-gold font-display text-lg font-extrabold uppercase text-black hover:bg-gold/90">
                      <Plane className="mr-1.5 h-4 w-4" aria-hidden="true" /> Load {clubName}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setLineup(autoDraftN(ctx, lineup.off, lineup.def, src))} className="lab-btn text-lg">
                      <Sparkles className="mr-1.5 h-4 w-4" aria-hidden="true" /> Dream team
                    </Button>
                  </div>
                </div>
              ) : undefined
            }
          />
          <NflDepthChart ctx={ctx} lineup={lineup} onSlot={(id, k) => { setLineup((l) => setSlotN(l, id, k)); }} club={poolClub} injured={injured} />
        </div>
      </div>

      {stepAside.length > 0 && (
        <p className="nfl-note" role="status">
          <b>Stepped aside:</b>{' '}
          {stepAside.map((s) => `${s.key.slice(s.key.indexOf(':') + 1)} (${s.code})`).join(', ')}. The next man on the depth chart plays.
        </p>
      )}

      {filled > 0 && !isCompleteN(lineup) && (
        <div className="lab-togo" role="status">
          <span className="lab-togo-n">{22 - filled}</span>
          <span className="min-w-0 flex-1">
            <b>slot{22 - filled === 1 ? '' : 's'} to go</b>
            <span className="block truncate text-xs text-muted-foreground">Still need: {activeSlots(lineup).filter((s) => !lineup.s[s.id]).map((s) => s.label).join(', ')}</span>
          </span>
          <span className="lab-togo-bar" aria-hidden="true"><i style={{ transform: `scaleX(${filled / 22})` }} /></span>
        </div>
      )}

      {isCompleteN(lineup) && (
        <>
          <NflReport ctx={ctx} lineup={lineup} depth={depth} lab={lab} injured={injured} src={src} clubName={clubName} />
          <NflH2H ctx={ctx} lineup={lineup} depth={depth} lab={lab} injured={injured} src={src} clubName={clubName} saved={saved.list} kitClub={kitClub} />
        </>
      )}

      <NflSaved
        kind="team"
        list={saved.list}
        canSave={filled > 0}
        onSave={(name) => saved.add({ name, kind: 'team', lineup })}
        onLoad={(s) => { if (s.kind === 'team') { setLineup(s.lineup); setLoaded(null); } }}
        onRename={saved.rename}
        onDelete={saved.remove}
        summary={(s) => {
          if (s.kind !== 'team') return null;
          const sc = scoreN(ctx, s.lineup, src);
          return sc ? `Team ${sc.team.grade.grade} · ${Math.round(sc.team.score)}` : `${filledN(s.lineup)}/22`;
        }}
      />
    </div>
  );
};

const NflTeamLab = () => {
  const nl = useNflLab();
  const [prefs, setPrefs] = usePrefs();
  if (!nl.ctx) return <PixelLoader label="Team Lab" what="the league" minHeight="60vh" className="container justify-start pt-[14vh]" />;
  const onMode = (m: 'team' | 'fantasy') => setPrefs({ mode: m });
  const ready = nl as NflLabReady;
  return prefs.mode === 'fantasy' ? <FantasyMode nl={ready} prefs={prefs} setPrefs={setPrefs} onMode={onMode} /> : <TeamMode nl={ready} prefs={prefs} setPrefs={setPrefs} onMode={onMode} />;
};

export default NflTeamLab;
