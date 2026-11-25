import { SlidersHorizontal } from 'lucide-react';
import { ArcadeToggle } from '@/components/arcade';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { ClubSelect } from '@/components/teamlab/nfl/NflShared';
import type { Prefs } from '@/components/teamlab/nfl/useNflLab';
import type { Turf } from '@/components/teamlab/fieldArt';
import { SCORING, SCORING_FIELDS, type Scoring, type ScoringId } from '@/utils/nflFantasy';
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

const Group = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div className="fh-set"><span className="fh-set__k">{k}</span>{children}</div>
);

/** League settings in one compact sheet: scoring, league size, starters, TE premium, weeks 15-17, stadium. */
const LeagueSheet = ({
  open, onOpenChange, prefs, setPrefs, settings, setSettings, scoring, turf, setTurf,
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
}) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="bottom" className="fh-sheet max-h-[88dvh] overflow-y-auto">
      <SheetTitle className="font-display text-xl uppercase">League</SheetTitle>
      <SheetDescription className="sr-only">Scoring, league size and starters for the lineup, start / sit, head-to-head and trade pages.</SheetDescription>
      <div className="fh-sheet__g">
        <Group k="Scoring">
          <ArcadeToggle<ScoringId>
            label="Scoring" size="sm" value={prefs.scoring}
            options={(['ppr', 'half', 'std', 'custom'] as const).map((v) => ({ value: v, label: SC_LABEL[v] }))}
            onChange={(v) => {
              setPrefs({ scoring: v, custom: prefs.custom ?? { ...SCORING.ppr } });
              if (v !== 'custom') setSettings({ scoring: v });
            }}
          />
        </Group>
        <Group k="League size">
          <ArcadeToggle<number> label="League size" size="sm" value={settings.teams} options={[10, 12, 14].map((v) => ({ value: v, label: `${v} teams` }))} onChange={(v) => setSettings({ teams: v as 10 | 12 | 14 })} />
        </Group>
        <Group k="Starters">
          <ArcadeToggle<string> label="Quarterbacks" size="sm" value={settings.superflex ? 'sf' : '1'} options={[{ value: '1', label: '1 QB' }, { value: 'sf', label: 'Superflex' }]} onChange={(v) => setSettings({ superflex: v === 'sf' })} />
        </Group>
        <Group k="Tight ends">
          <ArcadeToggle<string> label="TE premium" size="sm" value={settings.tePremium ? 'on' : 'off'} options={[{ value: 'off', label: 'Standard' }, { value: 'on', label: 'Premium' }]} onChange={(v) => setSettings({ tePremium: v === 'on' })} />
        </Group>
        <Group k="Weeks 15–17">
          <ArcadeToggle<number> label="Playoff weeks weight" size="sm" value={settings.playoffWeight} options={[{ value: 1, label: 'Off' }, { value: 1.5, label: '×1.5' }, { value: 2, label: '×2' }]} onChange={(v) => setSettings({ playoffWeight: v as 1 | 1.5 | 2 })} />
        </Group>
        <Group k="Stadium">
          <div className="fh-set__row">
            <ClubSelect value={prefs.club} onChange={(c) => setPrefs({ club: c })} label="Stadium" />
            <ArcadeToggle<Turf> label="Field conditions" size="sm" value={turf} options={[{ value: 'day', label: 'Day' }, { value: 'night', label: 'Night' }, { value: 'snow', label: 'Snow' }]} onChange={setTurf} />
          </div>
        </Group>
        {prefs.scoring === 'custom' && (
          <div className="fh-set fh-set--wide">
            <span className="fh-set__k">Custom scoring</span>
            <div className="fh-custom">
              {SCORING_FIELDS.map((f) => (
                <label key={f.id}>
                  <span>{f.label}</span>
                  <Input type="number" step={f.step} value={scoring[f.id]} onChange={(e) => setPrefs({ custom: { ...scoring, [f.id]: Number(e.target.value) || 0 } })} className="h-8 border-line bg-night/60 text-sm" />
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </SheetContent>
  </Sheet>
);

export default LeagueSheet;
