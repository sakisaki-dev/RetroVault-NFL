import { useMemo, type ReactNode } from 'react';
import { CloudSnow, Flag, ListOrdered, MapPin, Moon, SlidersHorizontal, Sun, Trophy, Users } from 'lucide-react';
import { InfoTip } from '@/components/ui/InfoTip';
import { fxTone } from '@/components/fantasy/ClubMark';
import { findNFLTeam } from '@/utils/nflTeams';
import type { LabFile } from '@/utils/nflLabData';
import { ArcadeToggle } from '@/components/arcade';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { ClubSelect } from '@/components/teamlab/nfl/NflShared';
import type { Prefs } from '@/components/teamlab/nfl/useNflLab';
import type { Turf } from '@/components/teamlab/fieldArt';
import { SCORING, SCORING_FIELDS, pointsOf, type Scoring, type ScoringId } from '@/utils/nflFantasy';
import type { TradeSettings } from '@/utils/tradeSim';

const SC_LABEL: Record<ScoringId, string> = { ppr: 'PPR', half: 'Half', std: 'Std', custom: 'Custom' };

/** "PPR · 12 · 1QB": the one-line summary the League chip shows. */
export const leagueSummary = (prefs: Prefs, s: TradeSettings) =>
  [prefs.scoring === 'custom' ? 'Custom' : SC_LABEL[prefs.scoring], `${s.teams}`, s.superflex ? 'SF' : '1QB', s.tePremium && 'TE+'].filter(Boolean).join(' · ');

export const LeagueChip = ({ summary, onClick }: { summary: string; onClick: () => void }) => (
  <button type="button" className="fh-chip" onClick={onClick} aria-haspopup="dialog">
    <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
    <span className="fh-chip__k">League</span>
    <b>{summary}</b>
  </button>
);

const Seg = <T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: ReactNode; icon?: ReactNode }[]; onChange: (v: T) => void }) => (
  <ArcadeToggle<T> label={label} size="sm" value={value} options={options} onChange={onChange} compact="never" className="fh-seg" />
);

const Card = ({ icon, k, children, wide }: { icon: ReactNode; k: string; children: ReactNode; wide?: boolean }) => (
  <section className={`fh-lgc${wide ? ' fh-lgc--wide' : ''}`} aria-label={k}>
    <h3 className="fh-lgc__k"><span className="fh-lgc__i" aria-hidden="true">{icon}</span>{k}</h3>
    {children}
  </section>
);

const Ctl = ({ k, children }: { k: string; children: ReactNode }) => (
  <div className="fh-lgc__c"><span className="fh-set__k">{k}</span>{children}</div>
);

/** One receiver-type player whose points move most with the scoring: the sheet's live preview. */
const previewKey = (lab: LabFile | null | undefined) => {
  if (!lab) return null;
  let best: string | null = null;
  let rec = 0;
  for (const [k, v] of Object.entries(lab.p)) {
    if ((k.startsWith('WR:') || k.startsWith('RB:') || k.startsWith('TE:')) && v.f[5] > rec) { rec = v.f[5]; best = k; }
  }
  return best;
};

/** League settings in one compact sheet: scoring, roster, playoffs, look. */
const LeagueSheet = ({
  open, onOpenChange, prefs, setPrefs, settings, setSettings, scoring, turf, setTurf, lab, summary,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  settings: TradeSettings;
  setSettings: (p: Partial<TradeSettings>) => void;
  scoring: Scoring;
  turf: Turf;
  setTurf: (t: Turf) => void;
  lab?: LabFile | null;
  summary?: string;
}) => {
  const club = findNFLTeam(prefs.club);
  const pk = useMemo(() => previewKey(lab), [lab]);
  const lp = pk && lab ? lab.p[pk] : null;
  const base = lp ? pointsOf(lp.f, SCORING.ppr) : 0;
  const now = lp ? pointsOf(lp.f, scoring) : 0;
  const unit = prefs.scoring === 'custom' ? 'custom' : SC_LABEL[prefs.scoring];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="fh-sheet fh-lgs max-h-[92dvh] overflow-y-auto" style={fxTone(club?.name ?? prefs.club)}>
        <div className="fh-lgs__h">
          <SheetTitle className="font-display text-2xl uppercase">League</SheetTitle>
          <b className="fh-lgs__sum">{summary ?? `${unit} · ${settings.teams} teams · ${settings.superflex ? 'Superflex' : '1QB'}`}</b>
          <InfoTip label="About league settings" className="fh-info">Scoring, league size and starters apply to the lineup, start / sit, head-to-head and trade pages.</InfoTip>
        </div>
        <SheetDescription className="sr-only">Scoring, league size and starters for the lineup, start / sit, head-to-head and trade pages.</SheetDescription>
        <div className="fh-lgs__g">
          <Card icon={<ListOrdered className="h-4 w-4" />} k="Scoring">
            <Ctl k="Format">
              <Seg<ScoringId>
                label="Scoring" value={prefs.scoring}
                options={(['ppr', 'half', 'std', 'custom'] as const).map((v) => ({ value: v, label: SC_LABEL[v] }))}
                onChange={(v) => {
                  setPrefs({ scoring: v, custom: prefs.custom ?? { ...SCORING.ppr } });
                  if (v !== 'custom') setSettings({ scoring: v });
                }}
              />
            </Ctl>
            <Ctl k="Tight ends">
              <Seg<string> label="TE premium" value={settings.tePremium ? 'on' : 'off'} options={[{ value: 'off', label: 'Standard' }, { value: 'on', label: 'Premium' }]} onChange={(v) => setSettings({ tePremium: v === 'on' })} />
            </Ctl>
            {prefs.scoring === 'custom' && (
              <div className="fh-custom">
                {SCORING_FIELDS.map((f) => (
                  <label key={f.id}>
                    <span>{f.label}</span>
                    <Input type="number" step={f.step} value={scoring[f.id]} onChange={(e) => setPrefs({ custom: { ...scoring, [f.id]: Number(e.target.value) || 0 } })} className="h-8 border-line bg-night/60 text-sm" />
                  </label>
                ))}
              </div>
            )}
          </Card>
          <Card icon={<Users className="h-4 w-4" />} k="Roster">
            <Ctl k="League size">
              <Seg<number> label="League size" value={settings.teams} options={[10, 12, 14].map((v) => ({ value: v, label: `${v} teams` }))} onChange={(v) => setSettings({ teams: v as 10 | 12 | 14 })} />
            </Ctl>
            <Ctl k="Starters">
              <Seg<string> label="Quarterbacks" value={settings.superflex ? 'sf' : '1'} options={[{ value: '1', label: '1 QB' }, { value: 'sf', label: 'Superflex' }]} onChange={(v) => setSettings({ superflex: v === 'sf' })} />
            </Ctl>
          </Card>
          <Card icon={<Trophy className="h-4 w-4" />} k="Playoffs">
            <Ctl k="Weeks 15–17 weight">
              <Seg<number> label="Playoff weeks weight" value={settings.playoffWeight} options={[{ value: 1, label: 'Off', icon: <Flag className="h-3.5 w-3.5" aria-hidden="true" /> }, { value: 1.5, label: '×1.5' }, { value: 2, label: '×2' }]} onChange={(v) => setSettings({ playoffWeight: v as 1 | 1.5 | 2 })} />
            </Ctl>
          </Card>
          <Card icon={<MapPin className="h-4 w-4" />} k="Look">
            <Ctl k="Stadium">
              <ClubSelect value={prefs.club} onChange={(c) => setPrefs({ club: c })} label="Stadium" compact />
            </Ctl>
            <Ctl k="Field">
              <Seg<Turf> label="Field conditions" value={turf} options={[{ value: 'day', label: 'Day', icon: <Sun className="h-3.5 w-3.5" aria-hidden="true" /> }, { value: 'night', label: 'Night', icon: <Moon className="h-3.5 w-3.5" aria-hidden="true" /> }, { value: 'snow', label: 'Snow', icon: <CloudSnow className="h-3.5 w-3.5" aria-hidden="true" /> }]} onChange={setTurf} />
            </Ctl>
          </Card>
        </div>
        {lp && pk && (
          <p className="fh-lgs__pre" aria-live="polite">
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{pk.slice(pk.indexOf(':') + 1)}</span>
            <b>{base.toFixed(1)} <i>PPR</i> → {now.toFixed(1)} <i>{unit}/g</i></b>
          </p>
        )}
        <div className="fh-lgs__done"><button type="button" className="fh-btn fh-btn--go" onClick={() => onOpenChange(false)}>Done</button></div>
      </SheetContent>
    </Sheet>
  );
};

export default LeagueSheet;
