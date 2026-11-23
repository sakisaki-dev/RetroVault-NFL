import { useState, type ReactNode } from 'react';
import { Check, Pencil, Save, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { SavedLab } from './useNflLab';

/** Saved lineups of one kind (team or fantasy): kept in this browser, "nfl:"-namespaced. */
const NflSaved = ({
  kind,
  list,
  canSave,
  onSave,
  onLoad,
  onRename,
  onDelete,
  summary,
}: {
  kind: SavedLab['kind'];
  list: SavedLab[];
  canSave: boolean;
  onSave: (name: string) => void;
  onLoad: (s: SavedLab) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  summary: (s: SavedLab) => ReactNode;
}) => {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const mine = list.filter((s) => s.kind === kind);
  return (
    <section aria-labelledby="nfl-saved" className="glass-card min-w-0 p-3 sm:p-4">
      <h2 id="nfl-saved" className="section-title mb-3 text-lg">
        Saved {kind === 'team' ? 'lineups' : 'fantasy lineups'}
      </h2>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSave) return;
          onSave(name || `Lineup ${mine.length + 1}`);
          setName('');
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this lineup" aria-label="Lineup name" maxLength={40} className="h-9 min-w-0 border-line bg-night/60" />
        <Button type="submit" size="sm" disabled={!canSave} className="shrink-0 font-display font-bold uppercase">
          <Save className="mr-1 h-4 w-4" aria-hidden="true" /> Save
        </Button>
      </form>
      {mine.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Saved lineups stay in this browser and become head-to-head opponents.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {mine.map((t) => (
            <li key={t.id} className="flex min-w-0 items-center gap-2 rounded-md bg-panel-2/60 px-2 py-1.5 ring-1 ring-line/60">
              {editing === t.id ? (
                <form
                  className="flex min-w-0 flex-1 gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    onRename(t.id, draft);
                    setEditing(null);
                  }}
                >
                  <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={`New name for ${t.name}`} maxLength={40} className="h-7 min-w-0 border-line bg-night/60 text-sm" />
                  <Button type="submit" size="sm" variant="ghost" className="h-7 px-2" aria-label="Save name">
                    <Check className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </form>
              ) : (
                <span className="min-w-0 flex-1 truncate font-display text-[15px] font-bold uppercase tracking-wide text-chalk">
                  {t.name} <span className="ml-1 text-xs normal-case text-muted-foreground">{summary(t)}</span>
                </span>
              )}
              {editing !== t.id && (
                <span className="flex shrink-0 items-center">
                  <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => onLoad(t)} aria-label={`Load ${t.name}`}>
                    <Upload className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setEditing(t.id); setDraft(t.name); }} aria-label={`Rename ${t.name}`}>
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground hover:text-destructive" onClick={() => onDelete(t.id)} aria-label={`Delete ${t.name}`}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default NflSaved;
