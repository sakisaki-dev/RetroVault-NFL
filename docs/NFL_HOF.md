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
