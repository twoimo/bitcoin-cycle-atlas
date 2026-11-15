------------------------------ MODULE EthLoad ------------------------------
EXTENDS Naturals, FiniteSets

\* Line citations refer to dist/eth-view.js at fe93a5727277d15a934b7472588fb907e30b02b8
\* unless another file is named.
CONSTANTS RequestLimit, BootOnRender, RespectSuspension, PreserveNavigation,
          GuardResponses, GuardErrors
Ids == 1..RequestLimit
Phases == {"unused", "archive", "live", "done"}
Intervals == {"daily", "weekly"}
VARIABLE s
vars == <<s>>

\* urlRange: a shared link supplied a date range (line 51, pendingUrlRange) that the
\* first painted series applies without a navigation revision. obscured: chart
\* replay or a center tool owns the plot.
Init ==
  \E url \in BOOLEAN:
  s = [issued |-> 0, active |-> 0, phase |-> [i \in Ids |-> "unused"],
       forced |-> [i \in Ids |-> FALSE], navigated |-> [i \in Ids |-> FALSE],
       attached |-> TRUE, loading |-> FALSE, prices |-> 0, priceError |-> FALSE,
       refreshError |-> FALSE, renderPending |-> FALSE, ready |-> FALSE,
       readyCount |-> 0, initialDone |-> FALSE, frequency |-> "daily",
       range |-> "auto", badReadiness |-> FALSE, hiddenPublication |-> FALSE,
       stalePublication |-> FALSE, lostNavigation |-> FALSE,
       obscured |-> FALSE, urlRange |-> url]

Usable == s.prices > 0 \/ s.priceError
CanRender == s.attached \/ ~RespectSuspension
\* A paint with a series consumes the pending URL range (lines 248-251).
UrlApplies == s.urlRange /\ s.prices > 0

\* One synchronous load() start, through its first await; a cached non-force
\* daily/weekly load has no awaited HTTP and completes in this same action.
\* Lines 280-307; RequestLimit is a model bound, never a runtime guard.
\* changeInterval (lines 309-313) carries the previous viewport in intervalViewport
\* and render retargets it (lines 248-256), so an interval change keeps the range
\* class (tests/native-chart-viewport.test.mjs).
BeginLoad(force, frequency) ==
  /\ s.issued < RequestLimit \* verification/eth-state/EthLoad.cfg:3 finite bound
  /\ LET id == s.issued + 1
         phase == IF s.prices = 0 THEN "archive" ELSE IF force THEN "live" ELSE "done"
     IN s' = [s EXCEPT !.issued = id, !.active = id, !.attached = TRUE,
               !.phase[id] = phase, !.forced[id] = force, !.navigated[id] = FALSE,
               !.loading = phase # "done", !.priceError = FALSE, !.refreshError = FALSE,
               !.renderPending = TRUE, !.frequency = frequency]

\* Line 360 the initializer opens its first archive.
Open ==
  /\ s.issued = 0 \* line 360 single initializer invocation
  /\ BeginLoad(FALSE, "daily")

\* Line 320 refresh/retry is available after the shell is released.
\* The button is disabled only by a later render, so two clicks can start two
\* requests before that frame. Allow refresh while loading: this over-approximates
\* even a painted disabled button rather than assuming a synchronous load guard.
Refresh ==
  /\ s.ready /\ s.attached \* lines 56, 281, 320
  /\ BeginLoad(TRUE, s.frequency)

\* Lines 309-313 the interval callback starts a new load and revokes the old
\* generation, including a live refresh. Two supported intervals bound it.
ChangeInterval ==
  /\ s.ready /\ s.attached \* lines 56, 281, 309
  /\ \E frequency \in Intervals \ {s.frequency}: BeginLoad(FALSE, frequency)

\* Line 288; setPayload parses both daily and weekly before publishing.
\* A successful force retry immediately starts its live request in this continuation.
ArchiveArrives(id) ==
  /\ s.phase[id] = "archive" \* line 288 pending getArchive await
  /\ LET accepted == id = s.active \/ ~GuardResponses
     IN s' = [s EXCEPT
       !.phase[id] = IF accepted /\ s.forced[id] THEN "live" ELSE "done",
       !.prices = IF accepted THEN id ELSE s.prices,
       !.loading = IF id = s.active /\ ~s.forced[id] THEN FALSE ELSE s.loading,
       !.renderPending = s.renderPending \/ (id = s.active /\ ~s.forced[id] /\ (s.attached \/ ~RespectSuspension)),
       !.stalePublication = s.stalePublication \/ (accepted /\ id # s.active)]

\* Lines 289, 303-307 error handling/finally runs without another await.
ArchiveFails(id) ==
  /\ s.phase[id] = "archive" \* lines 288-289 pending getArchive await
  /\ LET accepted == id = s.active \/ ~GuardErrors
     IN s' = [s EXCEPT !.phase[id] = "done",
       !.priceError = s.priceError \/ (accepted /\ s.prices = 0),
       !.refreshError = s.refreshError \/ (accepted /\ s.prices > 0),
       !.loading = IF id = s.active THEN FALSE ELSE s.loading,
       !.renderPending = s.renderPending \/ (id = s.active /\ (s.attached \/ ~RespectSuspension)),
       !.stalePublication = s.stalePublication \/ (accepted /\ id # s.active)]

\* Lines 295-301 the live continuation owns prices only if its generation
\* still matches. A navigation token records whether user input happened since start.
\* If an interval viewport is still pending (render obscured), its retarget can
\* bring back the earlier range; "auto" then understates preservation, which
\* cannot hide a lost navigation because that requires a navigated request.
LiveArrives(id) ==
  /\ s.phase[id] = "live" \* line 295 pending fetchMarketCandles await
  /\ LET accepted == id = s.active \/ ~GuardResponses
         preserve == PreserveNavigation /\ s.navigated[id]
     IN s' = [s EXCEPT !.phase[id] = "done",
       !.prices = IF accepted THEN id ELSE s.prices,
       !.range = IF accepted /\ ~preserve THEN "auto" ELSE s.range,
       !.loading = IF id = s.active THEN FALSE ELSE s.loading,
       !.renderPending = s.renderPending \/ (id = s.active /\ (s.attached \/ ~RespectSuspension)),
       !.stalePublication = s.stalePublication \/ (accepted /\ id # s.active),
       !.lostNavigation = s.lostNavigation \/ (accepted /\ s.navigated[id] /\ s.range = "custom" /\ ~preserve)]

\* Lines 303-307 failed live refresh keeps the last valid prices.
LiveFails(id) ==
  /\ s.phase[id] = "live" \* line 295 pending fetchMarketCandles await
  /\ LET accepted == id = s.active \/ ~GuardErrors
     IN s' = [s EXCEPT !.phase[id] = "done",
       !.refreshError = s.refreshError \/ accepted,
       !.loading = IF id = s.active THEN FALSE ELSE s.loading,
       !.renderPending = s.renderPending \/ (id = s.active /\ (s.attached \/ ~RespectSuspension)),
       !.stalePublication = s.stalePublication \/ (accepted /\ id # s.active)]

\* Line 109 new navigation increments navigationRevision, as do the workbench go-to
\* range action (line 340, dist/native-chart-workbench.js:238) and the post-await
\* focusHistoricalEvent writer (lines 125-132). Equality with each captured token
\* becomes false monotonically; booleans abstract this equality exactly for the
\* bounded set of pending requests, not numeric prices. Daily coverage enables the
\* history jump; a cached daily load yields only microtasks. From weekly,
\* ChangeInterval then Pan over-approximates that callback; there is no assumed
\* synchronous load lock or external-event guard inside the await.
Pan ==
  /\ s.ready /\ s.attached /\ s.prices > 0 \* lines 56, 109, 125-132
  /\ s' = [s EXCEPT !.range = "custom", !.navigated = [i \in Ids |-> TRUE], !.renderPending = TRUE]

\* dist/native-chart-workbench.js:82 undo/redo assigns a snapshot of frequency and
\* range, then onRestore (line 341) loads a frequency with no series, and onChange
\* (line 341) increments navigationRevision and schedules. The load captures its
\* token before that increment, so it counts as navigated. A custom range needs a
\* drawn series. Other workbench commands take the same onChange path unchanged.
Restore ==
  /\ s.ready /\ s.attached \* lines 56, 281
  /\ \E f \in Intervals, r \in IF s.prices > 0 THEN {"auto", "custom"} ELSE {"auto"}:
       IF f # s.frequency /\ s.prices = 0
       THEN /\ s.issued < RequestLimit \* verification/eth-state/EthLoad.cfg:3 finite bound
            /\ LET id == s.issued + 1
               IN s' = [s EXCEPT !.issued = id, !.active = id,
                         !.phase[id] = "archive", !.forced[id] = FALSE,
                         !.navigated = [i \in Ids |-> TRUE],
                         !.loading = TRUE, !.priceError = FALSE, !.refreshError = FALSE,
                         !.renderPending = TRUE, !.frequency = f, !.range = r]
       ELSE s' = [s EXCEPT !.frequency = f, !.range = r,
                    !.navigated = [i \in Ids |-> TRUE], !.renderPending = TRUE]

\* Lines 212-269 a queued render is one synchronous continuation.
Render ==
  /\ s.renderPending \* line 271 scheduled requestAnimationFrame
  /\ ~s.obscured \* line 214
  /\ LET emit == CanRender /\ BootOnRender /\ Usable /\ ~s.ready
     IN s' = [s EXCEPT !.renderPending = FALSE,
       !.ready = s.ready \/ emit, !.readyCount = s.readyCount + IF emit THEN 1 ELSE 0,
       !.hiddenPublication = s.hiddenPublication \/ (CanRender /\ ~s.attached),
       !.urlRange = s.urlRange /\ ~(CanRender /\ UrlApplies),
       !.range = IF CanRender /\ UrlApplies THEN "custom" ELSE s.range]

\* Line 214 an open replay or center tool consumes the queued frame unpainted.
SkipRender ==
  /\ s.renderPending /\ s.obscured
  /\ s' = [s EXCEPT !.renderPending = FALSE]

\* Lines 360-361 the first load's promise settles even after revocation.
\* The original baseline emitted atlas:ready unconditionally after this callback.
\* The fixed code delegates readiness to guarded render(), with a chart or retry.
InitialFrame ==
  /\ s.phase[1] = "done" /\ ~s.initialDone \* line 361 final initializer await
  /\ LET paints == CanRender /\ ~s.obscured
         emit == IF BootOnRender THEN paints /\ Usable /\ ~s.ready ELSE TRUE
     IN s' = [s EXCEPT !.initialDone = TRUE, !.renderPending = FALSE,
       !.ready = s.ready \/ emit, !.readyCount = s.readyCount + IF emit THEN 1 ELSE 0,
       !.badReadiness = s.badReadiness \/ (emit /\ ~Usable),
       !.hiddenPublication = s.hiddenPublication \/ (~s.attached /\ (paints \/ emit)),
       !.urlRange = s.urlRange /\ ~(paints /\ UrlApplies),
       !.range = IF paints /\ UrlApplies THEN "custom" ELSE s.range]

\* Lines 345-351 hiding revokes ownership and cancels the tracked frame.
Hide ==
  /\ s.issued > 0 \* lines 43-360 no event interleaves before first load
  /\ s.attached \* line 345 browser pagehide event
  /\ s' = [s EXCEPT !.attached = FALSE, !.active = 0, !.loading = FALSE, !.renderPending = FALSE]

\* Lines 353-357 a BFCache restoration reloads missing prices, or schedules
\* retained valid prices. No invariant assumes abort prevents late completion.
Show ==
  /\ ~s.attached \* lines 353-355 paired persisted pageshow
  /\ IF s.prices = 0 THEN BeginLoad(FALSE, s.frequency)
     ELSE s' = [s EXCEPT !.attached = TRUE, !.renderPending = TRUE]

\* Line 343 late layout/font notification, including suspension.
Resize ==
  /\ s.issued > 0 \* lines 43-360 no callback interleaves before first load
  /\ s' = [s EXCEPT !.renderPending = s.renderPending \/ (s.attached \/ ~RespectSuspension)]

\* dist/chart-replay.js:345 and dist/center-workbench.js:151 take the plot.
Obscure ==
  /\ ~s.obscured
  /\ s' = [s EXCEPT !.obscured = TRUE]

\* dist/chart-replay.js:371-376 exit calls restore, which is schedule (line 342);
\* dist/center-workbench.js:177 closes a center tool without scheduling a paint.
Reveal ==
  /\ s.obscured
  /\ \E scheduled \in BOOLEAN:
       s' = [s EXCEPT !.obscured = FALSE,
              !.renderPending = s.renderPending \/ (scheduled /\ (s.attached \/ ~RespectSuspension))]

Next ==
  \* Lines 43-360 setup and its first load have no intervening await.
  \* Hide/Resize carry this guard so TLC keeps distinct reader action labels.
  Open \/ Refresh \/ ChangeInterval \/ Pan \/ Restore \/ Render \/ SkipRender \/ InitialFrame
  \/ Hide \/ Show \/ Resize \/ Obscure \/ Reveal
  \/ \E id \in Ids: ArchiveArrives(id) \/ ArchiveFails(id) \/ LiveArrives(id) \/ LiveFails(id)

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ s.issued \in 0..RequestLimit /\ s.active \in 0..RequestLimit
  /\ s.phase \in [Ids -> Phases] /\ s.forced \in [Ids -> BOOLEAN]
  /\ s.navigated \in [Ids -> BOOLEAN] /\ s.prices \in 0..RequestLimit
  /\ s.frequency \in Intervals /\ s.range \in {"auto", "custom"}
  /\ s.readyCount \in 0..2
  /\ \A name \in {"attached","loading","priceError","refreshError","renderPending",
                   "ready","initialDone","badReadiness","hiddenPublication",
                   "stalePublication","lostNavigation","obscured","urlRange"}: s[name] \in BOOLEAN

\* Readiness may be announced only when the selected chart has prices or a
\* rendered actionable error. Guarded by lines 212, 236, 269, 361.
ReadyHasUsableView == ~s.badReadiness

\* A suspended page must publish neither chart updates nor readiness, even if an
\* old queued callback runs. Guarded by lines 214, 271, 345-347.
NoHiddenPublication == ~s.hiddenPublication

\* Revoked archive/live successes or failures never write current displayed state.
\* Guarded by lines 288-289, 293, 296, 304, 307, 346.
NoStalePublication == ~s.stalePublication

\* A completed refresh may not reset navigation chosen after that request began.
\* Guarded by lines 109-110, 124, 132, 282, 293, 300-301, 312, 314, 340-341.
NavigationSurvivesRefresh == ~s.lostNavigation

\* One document announces readiness once, including retry and BFCache restore.
\* Guarded by line 212.
ReadinessOnce == s.readyCount <= 1
=============================================================================
