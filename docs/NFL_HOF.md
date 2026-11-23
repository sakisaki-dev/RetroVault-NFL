# NFL Hall of Fame (NFL edition)

`scripts/hall_of_fame.py` (RV_EDITION=nfl) -> `public/data/league/halloffame.json`, page `src/components/hof/NflHall.tsx`.

Members are the real Pro Football Hall of Fame inductees (data/nfl/hof.json) who are players here (71 in classes 1999-2026; 51 are
pre-1999 careers with 1999-on stats). The Hall of Fame Score (bar 65) is beside them and ranks everyone else.

Freeze: a retiree's case is the season his games last rose (NFL snapshots drop retirees, so a gap is not a new career). Before the
fix every retiree froze at the live 2026 snapshot.

Score (weights `NFL_W`, `nfl_score()`): standing (all-time rank at his position by Career Legacy, 54 for 1st) + elite seasons
(2 per season rating 93+, +2 at 97+, cap 28) + honours (MVP 30, OPOY/DPOY 18, SB MVP 12, ring 4, cap 40, x0.4) + records (+15 career,
+5 season) + longevity (4 a season past 9 from his debut, cap 20) + for a pre-1999 career only, flagged `nfl.partial`: 6 a missing
season (cap 45) and draft capital (top-10 pick 18, other first round 12, second round 6); its Career Legacy is stretched by the
missing seasons for ranking (x1 + 0.6 per missing/seen season, cap x2.5). Weights were fitted by random search to the real
inductees (~85% over the bar, fewest non-inductees over it), then rounded.

Lists: `ballot` = retired, not in, score 45+, eligible now (last season + 6 <= next class, 2027); `soon` = retired, eligible later
(Brady: last 2022, class of 2028); `snubs` = eligible for 3+ classes already held, score 65+; `watch` = actives. `chance` is a
logistic read-out of the score, not a forecast.

Confusion (bar 65, 71 inductees, 4,208 other retirees): formula as shipped on nfl-demo 7 / 64 inductees above/below, 5 retirees on
the ballot; after the freeze fix only 18 / 53, 20 non-inductees above; calibrated 62 / 9, 43 non-inductees above (32 eligible now,
11 not yet eligible). Below the bar: Butler 63, E. James 60, C. Johnson 46, Seymour 31, Revis 27, T. Davis 24, Kuechly 20, Willis 8, Hester 8.

## Classics (full pre-1999 careers, 2026-11-23)

The 56 partial careers now hold full career totals and 144 pre-1999 players were added (Montana, Young, Marino, Elway, Sanders, L. Taylor...), see
data/nfl/LEGENDS.md. Career-only players have no season ratings, so their peak is estimated: the elite seasons a player of that all-time standing and
length shows in the 1999-on careers (median share by rank bucket), flagged `nfl.est`; their frozen season is their last. A pre-1999 record holder counts
as the record holder for later retirees' freeze. The `partial` stretch and draft credit no longer apply to the replaced careers.
Weights re-fitted with `RV_EDITION=nfl python3 scripts/nfl/hof_fit.py --fit` (bounded so standing, peak and longevity keep their scale; penalty 0.9 a
non-inductee over the bar): stand_max 57, decay 0.63, elite_cap 13, long from 7 seasons at 9 a season (cap 20), honours x0.59 (cap 39).
Confusion (bar 65, 154 real inductees now in the data, 4,269 other retirees): old weights on the new data 68 inductees above / 86 below, 24 others
above; re-fitted 100 above / 54 below, 40 others above (mostly retirees the real Hall has not voted in: A. Peterson and Brady not yet eligible, Suggs,
J. Taylor, Reggie Wayne, Hines Ward, Gronkowski...). Members are always the real inductees (154, no member who is not one).
Aikman 46 -> 62, Young 76 -> 87, Montana 100, Rice 100, B. Sanders 74 -> 100, C. Johnson 45 -> 60, Kuechly 17 -> 30, Willis 8 -> 17 (a linebacker's
Career Legacy ranks him 85th-109th at the position; weights alone cannot lift that).
