import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { DEF_FORMS, OFF_FORMS, type DefForm, type OffForm } from '@/utils/nflLab';

/** Mini diagrams (viewBox 60 x 44): offense drawn from the line of scrimmage down, defense up. Dots, not names. */
const OL: [number, number][] = [[20, 20], [25, 20], [30, 20], [35, 20], [40, 20]];
const OFF_DOTS: Record<OffForm, { p: [number, number]; k: 'o' | 'q' | 'r' | 't' | 'w' }[]> = {
  '11': [...OL.map((p) => ({ p, k: 'o' as const })), { p: [30, 28], k: 'q' }, { p: [30, 36], k: 'r' }, { p: [45, 20], k: 't' }, { p: [6, 20], k: 'w' }, { p: [54, 24], k: 'w' }, { p: [14, 26], k: 'w' }],
  '12': [...OL.map((p) => ({ p, k: 'o' as const })), { p: [30, 28], k: 'q' }, { p: [30, 36], k: 'r' }, { p: [45, 20], k: 't' }, { p: [16, 20], k: 't' }, { p: [6, 22], k: 'w' }, { p: [54, 22], k: 'w' }],
  '21': [...OL.map((p) => ({ p, k: 'o' as const })), { p: [30, 27], k: 'q' }, { p: [24, 36], k: 'r' }, { p: [36, 36], k: 'r' }, { p: [45, 20], k: 't' }, { p: [6, 22], k: 'w' }, { p: [54, 22], k: 'w' }],
};
const DEF_DOTS: Record<DefForm, [number, number][]> = {
  '4-3': [[18, 24], [26, 24], [34, 24], [42, 24], [20, 15], [30, 15], [40, 15], [8, 8], [52, 8], [22, 4], [38, 4]],
  '3-4': [[22, 24], [30, 24], [38, 24], [12, 17], [24, 14], [36, 14], [48, 17], [8, 8], [52, 8], [22, 4], [38, 4]],
};
const KCOLOR = { o: '#9fb0cc', q: '#ffd23f', r: '#ffd23f', t: '#7cd6a0', w: '#7cc4ff' } as const;

const Shape = ({ children, side }: { children: React.ReactNode; side: 'o' | 'd' }) => (
  <svg viewBox="0 0 60 44" className="nfl-shape" aria-hidden="true">
    <rect x="0" y="0" width="60" height="44" rx="5" fill="rgb(255 255 255 / 0.05)" />
    <line x1="2" x2="58" y1={side === 'o' ? 18 : 27} y2={side === 'o' ? 18 : 27} stroke="rgb(255 255 255 / 0.3)" strokeDasharray="2 2" />
    {children}
  </svg>
);

/** The formation chip on the field: shows "11 · 4-3"; tap it and pick the offense and the defense from their shapes. */
const FormationPicker = ({ off, def, onChange }: { off: OffForm; def: DefForm; onChange: (off: OffForm, def: DefForm) => void }) => (
  <Popover>
    <PopoverTrigger asChild>
      <button type="button" className="nfl-form-chip" aria-label="Formation">
        <span className="nfl-form-k">Formation</span>
        <b>{off}</b>
        <i>·</i>
        <b>{def}</b>
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" sideOffset={8} collisionPadding={12} className="nfl-opt-pop nfl-form-pop z-[60]">
      <p className="nfl-opt-h">Offense</p>
      <div className="nfl-form-grid" role="group" aria-label="Offensive personnel">
        {OFF_FORMS.map((f) => (
          <button key={f.id} type="button" className={cn('nfl-form-card', off === f.id && 'is-on')} aria-pressed={off === f.id} aria-label={`Offense ${f.label}`} onClick={() => onChange(f.id, def)}>
            <Shape side="o">
              {OFF_DOTS[f.id].map((d, i) => (
                <circle key={i} cx={d.p[0]} cy={d.p[1]} r={d.k === 'o' ? 2.1 : 2.6} fill={KCOLOR[d.k]} />
              ))}
            </Shape>
            <b>{f.label}</b>
            <span>{f.note}</span>
          </button>
        ))}
      </div>
      <p className="nfl-opt-h">Defense</p>
      <div className="nfl-form-grid nfl-form-grid--2" role="group" aria-label="Base defense">
        {DEF_FORMS.map((f) => (
          <button key={f.id} type="button" className={cn('nfl-form-card', def === f.id && 'is-on')} aria-pressed={def === f.id} aria-label={`Defense ${f.label}`} onClick={() => onChange(off, f.id)}>
            <Shape side="d">
              {DEF_DOTS[f.id].map((d, i) => (
                <circle key={i} cx={d[0]} cy={d[1]} r="2.6" fill={i < (f.id === '4-3' ? 4 : 3) ? '#ff8a6b' : i < 7 ? '#ffd23f' : '#7cc4ff'} />
              ))}
            </Shape>
            <b>{f.label}</b>
            <span>{f.note}</span>
          </button>
        ))}
      </div>
    </PopoverContent>
  </Popover>
);

export default FormationPicker;
