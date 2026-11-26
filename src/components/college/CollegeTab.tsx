import PixelLoader from '@/components/ui/PixelLoader';
import { useCallback, useEffect, useRef } from 'react';
import { useSwipeTabs } from '@/hooks/useSwipeTabs';
import { ClipboardList, GraduationCap, Target } from 'lucide-react';
import { PageTabBar, PageTabs, type PageTab } from '@/components/nav/PageTabs';
import { useHubRoute } from '@/components/stats/hub/hashRoute';
import { useCollegeIndex, type CollegeSection } from '@/utils/collegeData';
import DraftBoard from './DraftBoard';
import { CollegeIndexView } from './Colleges';
import SchoolPage from './SchoolPage';
import WarRoom from './WarRoom';
import './college.css';

const SECTIONS: PageTab<CollegeSection>[] = [
  { value: 'draft', label: 'Draft boards', short: 'Boards', Icon: ClipboardList },
  { value: 'schools', label: 'Colleges', short: 'Colleges', Icon: GraduationCap },
  { value: 'warroom', label: 'War room', short: 'War room', Icon: Target },
];

/**
 * The College tab (NFL edition): every draft since 1980 as a draft-night board, every school with its NFL factory page,
 * and the next draft's war room (the projected order and each club's needs on one board, no prospects).
 * State lives in the hash: #college/draft?y=2000&r=6, #college/schools?s=ohio-state, #college/warroom?club=MIN&v=order.
 * The old #college/order and #college/mock routes open the war room (replaced, so Back skips them).
 * Data: scripts/nfl/college.py (public/data/nfl/college/) and scripts/nfl/playoff_odds.py.
 */
const CollegeTab = () => {
  const { route, navigate } = useHubRoute();
  const idx = useCollegeIndex();
  const legacy = route.section === 'order' || route.section === 'mock' ? route.section : null;
  const section: CollegeSection = SECTIONS.find((s) => s.value === route.section)?.value ?? (legacy ? 'warroom' : 'draft');
  const q = route.q ?? {};
  const year = Number(q.y) && idx?.years.some((y) => y[0] === Number(q.y)) ? Number(q.y) : idx?.latest ?? null;
  const round: number | 'all' = q.r === 'all' ? 'all' : Number(q.r) || 1;
  const go = useCallback(
    (s: CollegeSection, next: Record<string, string> = {}, replace = false) => navigate({ tab: 'college', section: s, ...(Object.keys(next).length ? { q: next } : {}) }, { replace }),
    [navigate],
  );
  const swipeRef = useRef<HTMLDivElement>(null);
  useSwipeTabs({ ref: swipeRef, values: SECTIONS.map((s) => s.value), value: section, onChange: (s) => go(s, s === 'draft' && year != null ? { y: String(year) } : {}) });
  useEffect(() => {
    if (!legacy) return;
    go('warroom', { ...(q.club ? { club: q.club } : {}), ...(legacy === 'order' ? { v: 'order' } : {}) }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacy]);

  if (idx === undefined) return <PixelLoader what="the draft room" minHeight={420} className="container py-6" />;
  if (idx === null || year == null) return <p className="cl-note container py-6">The college data isn't built yet (npm run nfl:rebuild).</p>;

  return (
    <div ref={swipeRef}>
      <PageTabBar>
        <PageTabs<CollegeSection> label="College sections" value={section} onChange={(s) => go(s, s === 'draft' ? { y: String(year) } : {})} tabs={SECTIONS} />
      </PageTabBar>
      <div className="cl container py-6 sm:py-8">

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
          <SchoolPage idx={idx} slug={q.s} onBack={() => go('schools')} onYear={(y, r) => go('draft', { y: String(y), r: String(r) })} />
        ) : (
          <CollegeIndexView idx={idx} onSchool={(slug) => go('schools', { s: slug })} />
        ))}
      {section === 'warroom' && (
        <WarRoom focus={q.club} view={q.v === 'order' ? 'order' : 'needs'} onView={(v) => go('warroom', { ...(q.club ? { club: q.club } : {}), ...(v === 'order' ? { v } : {}) }, true)} />
      )}
      </div>
    </div>
  );
};

export default CollegeTab;
