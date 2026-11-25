import { useCallback, useMemo } from 'react';
import { ArcadeToggle, StadiumHeader, type StagePlayer } from '@/components/arcade';
import { useHubRoute } from '@/components/stats/hub/hashRoute';
import { useCollegeIndex, useDraftYear, type CollegeSection } from '@/utils/collegeData';
import { usePlayoffOdds } from '@/utils/playoffOdds';
import DraftBoard from './DraftBoard';
import { CollegeIndexView, SchoolPage } from './Colleges';
import { NeedsMock, ProjectedOrder } from './ProjectedOrder';
import { usePlayerMap } from './shared';
import './college.css';

const SECTIONS: { value: CollegeSection; label: string }[] = [
  { value: 'draft', label: 'Draft boards' },
  { value: 'schools', label: 'Colleges' },
  { value: 'order', label: 'Projected order' },
  { value: 'mock', label: 'Needs mock' },
];

/**
 * The College tab (NFL edition): every draft since 1980 as a war-room board, every school with its players and draft
 * history, the next draft's projected first round from the season simulations, and a needs-based mock (no prospects).
 * State lives in the hash: #college/draft?y=2000&r=6, #college/schools?s=ohio-state, #college/order?club=MIN.
 * Data: scripts/nfl/college.py (public/data/nfl/college/) and scripts/nfl/playoff_odds.py.
 */
const CollegeTab = () => {
  const { route, navigate } = useHubRoute();
  const idx = useCollegeIndex();
  const odds = usePlayoffOdds();
  const section: CollegeSection = (SECTIONS.find((s) => s.value === route.section)?.value ?? 'draft');
  const q = route.q ?? {};
  const year = Number(q.y) && idx?.years.some((y) => y[0] === Number(q.y)) ? Number(q.y) : idx?.latest ?? null;
  const round: number | 'all' = q.r === 'all' ? 'all' : Number(q.r) || 1;
  const go = useCallback(
    (s: CollegeSection, next: Record<string, string> = {}, replace = false) => navigate({ tab: 'college', section: s, ...(Object.keys(next).length ? { q: next } : {}) }, { replace }),
    [navigate],
  );

  // The hero: the shown draft's best careers by the site's OVR, each in the kit of the club that drafted him
  const heroYear = useDraftYear(year);
  const players = usePlayerMap();
  const stage = useMemo<StagePlayer[]>(() => {
    const rated = (heroYear?.picks ?? []).filter((p) => p[6] && p[7] != null && players.get(p[6]!)).sort((a, b) => (b[7] ?? 0) - (a[7] ?? 0) || a[1] - b[1]).slice(0, 5);
    // the best in the middle
    const order = [3, 1, 0, 2, 4].filter((i) => i < rated.length);
    return order.map((i) => ({ player: players.get(rated[i][6]!)!, club: rated[i][2], action: i === 0 ? 'celebrate' : 'idle' }));
  }, [heroYear, players]);
  const heroClub = heroYear?.picks[0]?.[2] ?? 'Bears';

  if (idx === undefined) return <p className="cl-loading container py-6" role="status">Loading the draft room…</p>;
  if (idx === null || year == null) return <p className="cl-note container py-6">The college data isn't built yet (npm run nfl:rebuild).</p>;

  return (
    <div className="cl container py-6 sm:py-8">
      <StadiumHeader
        club={heroClub}
        players={stage}
        size="m"
        maxMobile={3}
        kicker={`Drafts ${idx.years[0][0]}–${idx.latest} · ${idx.schools.length} schools`}
        title="The Draft Room"
        right={
          odds?.draft ? (
            <span className="cl-hero__next">
              <span className="ax-kicker">Next up</span>
              <b>{odds.draft.year} draft</b>
            </span>
          ) : undefined
        }
        className="cl-hero"
      />
      <nav className="cl-nav" aria-label="College sections">
        <ArcadeToggle<CollegeSection> label="College section" value={section} onChange={(s) => go(s, s === 'draft' ? { y: String(year) } : {})} options={SECTIONS} />
      </nav>

      {section === 'draft' && (
        <DraftBoard
          idx={idx}
          year={year}
          round={round}
          onYear={(y) => go('draft', { y: String(y), r: String(round === 'all' ? 'all' : 1) }, true)}
          onRound={(r) => go('draft', { y: String(year), r: String(r) }, true)}
          onSchool={(slug) => go('schools', { s: slug })}
        />
      )}
      {section === 'schools' &&
        (q.s ? (
          <SchoolPage slug={q.s} onBack={() => go('schools')} onYear={(y, r) => go('draft', { y: String(y), r: String(r) })} />
        ) : (
          <CollegeIndexView idx={idx} onSchool={(slug) => go('schools', { s: slug })} />
        ))}
      {section === 'order' && <ProjectedOrder focus={q.club} onMock={(club) => go('mock', club ? { club } : {})} />}
      {section === 'mock' && <NeedsMock focus={q.club} onOrder={() => go('order')} />}
    </div>
  );
};

export default CollegeTab;
