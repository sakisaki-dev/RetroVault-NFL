import { useMemo, useState } from 'react';
import { useLeague } from '@/context/LeagueContext';
import { NFL_TEAMS } from '@/utils/nflTeams';
import { Marquee, SectionHeader, PixelPanel, PixelChip, ArcadeToggle, PixelSelect, PixelStepper, LedBoard, ClubBadge, ClubStrip, ScoreTile, PixelIcon, PIXEL_ICON_NAMES, SpriteStage, StadiumHeader, CrowdDivider } from './index';

/** Dev-only demo of every arcade primitive (#arcadekit). */
const ArcadeKitDemo = () => {
  const { getAllPlayers } = useLeague();
  const players = useMemo(() => [...getAllPlayers()].sort((a, b) => (b.careerLegacy ?? 0) - (a.careerLegacy ?? 0)).slice(0, 5), [getAllPlayers]);
  const [view, setView] = useState('division');
  const [on, setOn] = useState(true);
  const [club, setClub] = useState('Eagles');
  const [year, setYear] = useState(2025);
  const [n, setN] = useState(4);
  const clubs = NFL_TEAMS.map((t) => ({ value: t.name, label: t.fullName, hint: t.abbreviation }));
  return (
    <div className="axd px-4">
      <StadiumHeader club="Eagles" kicker="Stadium header" title="Sprites on the turf" players={players} size="m" right={<ClubBadge club="Eagles" />} />
      <SectionHeader title="Section header" kicker="Plain but on brand" club="Eagles" right={<ArcadeToggle<string> label="View" value={view} onChange={setView} options={[{ value: 'division', label: 'Division' }, { value: 'power', label: 'Power' }, { value: 'titles', label: 'Titles' }]} />} />
      <Marquee title="Marquee" kicker="Scoreboards only" right={<PixelChip pressed={on} onClick={() => setOn(!on)} icon={<PixelIcon name="star" size={12} />}>Lit</PixelChip>} />
      <Marquee title="Club marquee" kicker="Bengals" club="Bengals" />
      <div className="axd__row">
        <PixelPanel style={{ flex: '1 1 220px' }}><span className="ax-kicker">Default</span><p className="m-0 mt-1">Flat, clean data surface.</p></PixelPanel>
        <PixelPanel club="Chiefs" tone="stripe" watermark style={{ flex: '1 1 220px' }}><span className="ax-kicker">Stripe + logo</span><p className="m-0 mt-1">Club accent.</p></PixelPanel>
        <PixelPanel club="Bears" tone="fill" style={{ flex: '1 1 220px' }}><span className="ax-kicker">Fill</span><p className="m-0 mt-1">Club primary.</p></PixelPanel>
        <PixelPanel chunky style={{ flex: '1 1 220px' }}><span className="ax-kicker">Chunky</span><p className="m-0 mt-1">Stepped corners.</p></PixelPanel>
        <PixelPanel screen style={{ flex: '1 1 220px' }}><span className="ax-kicker">Screen</span><p className="m-0 mt-1">CRT scanlines.</p></PixelPanel>
      </div>
      <div className="axd__row">
        <ArcadeToggle label="Conference" value="AFC" onChange={() => {}} options={[{ value: 'AFC', label: 'AFC' }, { value: 'NFC', label: 'NFC' }]} />
        <ArcadeToggle label="Club-coloured" club="Packers" size="sm" value="a" onChange={() => {}} options={[{ value: 'a', label: 'This season' }, { value: 'b', label: 'Career' }]} />
        <PixelSelect<string> label="Club" prefix="CLUB" value={club} onChange={setClub} options={clubs} />
        <PixelStepper label="Season" value={year} onChange={setYear} min={2000} max={2030} />
        <PixelStepper label="Count" value={n} onChange={setN} values={[1, 2, 4, 8, 16]} />
      </div>
      <div className="axd__row">
        <LedBoard label="Score" value="27-24" />
        <LedBoard label="Titles" value={68} color="green" width={3} />
        <LedBoard label="Losses" value="FINAL" color="red" />
      </div>
      <div className="axd__row">
        {['Bengals', 'Raiders', 'Panthers', 'Eagles', 'Packers', 'Dolphins'].map((c) => <ClubBadge key={c} club={c} />)}
        <ClubStrip club="Bills" onClick={() => {}}>Buffalo Bills</ClubStrip>
        <ClubStrip club="Bengals">Cincinnati Bengals</ClubStrip>
        <ClubStrip club="Panthers" size="sm">Panthers</ClubStrip>
      </div>
      <CrowdDivider />
      <div className="axd__grid">
        <ScoreTile away={{ club: 'Bills', score: 27, record: '10-3' }} home={{ club: 'Chiefs', score: 24, record: '11-2' }} slot="SNF" onClick={() => {}} />
        <ScoreTile away={{ club: 'Eagles', score: 20 }} home={{ club: 'Cowboys', score: 23 }} status="ot" focus="Eagles" />
        <ScoreTile away={{ club: 'Bengals' }} home={{ club: 'Ravens' }} kickoff="THU 8:15" slot="TNF" />
        <ScoreTile away={{ club: 'Jets', score: 10 }} home={{ club: 'Patriots', score: 14 }} status="live" footer="Q3 4:12" />
      </div>
      <div className="axd__icons">
        {PIXEL_ICON_NAMES.map((i) => <figure key={i}><PixelIcon name={i} size={36} /><figcaption>{i}</figcaption></figure>)}
      </div>
      <SpriteStage club="Packers" time="day" kind="bust" size="s" players={players} />
      <SpriteStage club="Chiefs" players={players.slice(0, 1)} size="l" action="celebrate" />
    </div>
  );
};
export default ArcadeKitDemo;
