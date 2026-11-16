------------------------------ MODULE EthLoad ------------------------------
EXTENDS Naturals, FiniteSets

\* Line citations refer to dist/eth-view.js at 1722f1fc and to the runtime at c3bcb58f.
\* Up to line 421 the eth-view.js lines match 856e77422e0a43a77470aed2e3f64fa1e522880b;
\* later lines are one higher,
\* unless another file is named. src/charts/funnest-chart-runtime.js is the source
\* of the shipped dist/funnest-chart-runtime.bundle.js.
CONSTANTS RequestLimit, BootOnRender, RespectSuspension, PreserveNavigation,
          GuardResponses, GuardErrors, WaitForPaint, GuardPaintSuspension,
          GuardPaintMount, GuardViewport, TrackNativeNavigation
Ids == 1..RequestLimit
Phases == {"unused", "archive", "live", "done"}
Intervals == {"daily", "weekly"}
VARIABLE s
vars == <<s>>

\* urlRange: a shared link supplied a date range (line 53, pendingUrlRange) that the
\* first painted series applies without a navigation revision. obscured: chart
\* replay or a center tool owns the plot.
\* mounted: state.funnestMount exists (lines 309-311). shownFrequency and
\* shownOutdated tell whether it still holds currentSeries() (line 313). painted is
\* state.funnestReady and chartError is state.chartError. watching: a paint
\* confirmation is pending on the live mount. A second one pending on the same
\* mount settles like the first, so one flag stands for both. staleWatch: one is
\* pending on a destroyed mount. native: the user moved the mounted chart's own
\* window while the active refresh was pending.
Init ==
  \E url \in BOOLEAN:
  s = [issued |-> 0, active |-> 0, phase |-> [i \in Ids |-> "unused"],
       forced |-> [i \in Ids |-> FALSE], navigated |-> [i \in Ids |-> FALSE],
       attached |-> TRUE, loading |-> FALSE, prices |-> 0, priceError |-> FALSE,
       refreshError |-> FALSE, renderPending |-> FALSE, ready |-> FALSE,
       readyCount |-> 0, initialDone |-> FALSE, frequency |-> "daily",
       range |-> "auto", badReadiness |-> FALSE, hiddenPublication |-> FALSE,
       stalePublication |-> FALSE, lostNavigation |-> FALSE, lostNative |-> FALSE,
       obscured |-> FALSE, urlRange |-> url,
       mounted |-> FALSE, shownFrequency |-> "daily", shownOutdated |-> FALSE,
       painted |-> FALSE, chartError |-> FALSE, watching |-> FALSE, staleWatch |-> FALSE,
       native |-> FALSE]

\* Observed prices count once the mount confirmed painted pixels (lines 253, 337).
\* A load error or a chart error shows the retry instead (lines 268-271, 280).
Usable(r) == (r.prices > 0 /\ r.painted) \/ r.priceError \/ r.chartError
CanRender == s.attached \/ ~RespectSuspension

\* revealReady (line 251) announces once. The baseline announced only from its
\* initializer, so BootOnRender gates every other site.
Announce(r) ==
  IF BootOnRender /\ ~r.ready
  THEN [r EXCEPT !.ready = TRUE, !.readyCount = r.readyCount + 1,
                 !.badReadiness = r.badReadiness \/ ~Usable(r),
                 !.hiddenPublication = r.hiddenPublication \/ ~r.attached]
  ELSE r

\* schedule (line 339) queues one frame unless the page is suspended.
Scheduled(r) == [r EXCEPT !.renderPending = r.renderPending \/ (r.attached \/ ~RespectSuspension)]

\* render() past line 255. A series applies the pending URL range (lines 292-295),
\* then creates the mount (lines 309-311) or hands it a changed series (line 313).
\* Both start a paint watch, which clears state.funnestReady (line 253). Readiness
\* follows a confirmed paint (line 337) or, without a series, a load error (line 280).
\* Line 275 destroys the mount when the series disappears. Daily and weekly prices
\* never disappear, so in this model only Refresh destroys a mount.
Paint(r) ==
  LET series == r.prices > 0
      url == r.urlRange /\ series
      watch == series /\ (~r.mounted \/ r.shownOutdated \/ r.shownFrequency # r.frequency)
      drawn == [r EXCEPT !.hiddenPublication = r.hiddenPublication \/ ~r.attached,
                         !.urlRange = r.urlRange /\ ~url,
                         !.range = IF url THEN "custom" ELSE r.range,
                         !.mounted = series,
                         !.shownFrequency = IF series THEN r.frequency ELSE r.shownFrequency,
                         !.shownOutdated = FALSE,
                         !.painted = r.painted /\ ~watch,
                         !.watching = r.watching \/ watch]
  IN IF (IF series THEN drawn.painted \/ ~WaitForPaint ELSE r.priceError)
     THEN Announce(drawn) ELSE drawn

\* One synchronous load() start, through its first await; a cached non-force
\* daily/weekly load has no awaited HTTP and completes in this same action.
\* Lines 348-376; RequestLimit is a model bound, never a runtime guard.
\* changeInterval (lines 377-381) carries the previous viewport in intervalViewport
\* and render retargets it (lines 292-302), so an interval change keeps the range
\* class (tests/native-chart-viewport.test.mjs).
Begin(r, force, frequency) ==
  LET id == r.issued + 1
      phase == IF r.prices = 0 THEN "archive" ELSE IF force THEN "live" ELSE "done"
  IN [r EXCEPT !.issued = id, !.active = id, !.attached = TRUE,
               !.phase[id] = phase, !.forced[id] = force, !.navigated[id] = FALSE,
               !.native = FALSE,
               !.loading = phase # "done", !.priceError = FALSE, !.refreshError = FALSE,
               !.renderPending = TRUE, !.frequency = frequency]

BeginLoad(force, frequency) ==
  /\ s.issued < RequestLimit \* verification/eth-state/EthLoad.cfg:3 finite bound
  /\ s' = Begin(s, force, frequency)

\* Line 429 the initializer opens its first archive.
Open ==
  /\ s.issued = 0 \* line 429 single initializer invocation
  /\ BeginLoad(FALSE, "daily")

\* Line 388 refresh/retry is available after the shell is released.
\* The button is disabled only by a later render, so two clicks can start two
\* requests before that frame. Allow refresh while loading: this over-approximates
\* even a painted disabled button rather than assuming a synchronous load guard.
\* A retry after a chart error first destroys the mount and clears the error, so
\* the next paint mounts again and a watch still pending goes stale.
Refresh ==
  /\ s.ready /\ s.attached \* lines 58, 349, 388
  /\ s.issued < RequestLimit \* verification/eth-state/EthLoad.cfg:3 finite bound
  /\ s' = Begin(IF s.chartError
                THEN [s EXCEPT !.mounted = FALSE, !.shownFrequency = "daily",
                               !.shownOutdated = FALSE, !.painted = FALSE,
                               !.chartError = FALSE, !.watching = FALSE,
                               !.staleWatch = s.staleWatch \/ s.watching]
                ELSE s, TRUE, s.frequency)

\* Lines 377-381 the interval callback starts a new load and revokes the old
\* generation, including a live refresh. Two supported intervals bound it.
ChangeInterval ==
  /\ s.ready /\ s.attached \* lines 58, 349, 377
  /\ \E frequency \in Intervals \ {s.frequency}: BeginLoad(FALSE, frequency)

\* Line 356; setPayload parses both daily and weekly before publishing, so a
\* mounted chart no longer holds the current series.
\* A successful force retry immediately starts its live request in this continuation.
ArchiveArrives(id) ==
  /\ s.phase[id] = "archive" \* line 356 pending getArchive await
  /\ LET accepted == id = s.active \/ ~GuardResponses
     IN s' = [s EXCEPT
       !.phase[id] = IF accepted /\ s.forced[id] THEN "live" ELSE "done",
       !.prices = IF accepted THEN id ELSE s.prices,
       !.shownOutdated = s.shownOutdated \/ (accepted /\ s.mounted),
       !.loading = IF id = s.active /\ ~s.forced[id] THEN FALSE ELSE s.loading,
       !.renderPending = s.renderPending \/ (id = s.active /\ ~s.forced[id] /\ (s.attached \/ ~RespectSuspension)),
       !.stalePublication = s.stalePublication \/ (accepted /\ id # s.active)]

\* Lines 357, 371-375 error handling/finally runs without another await.
ArchiveFails(id) ==
  /\ s.phase[id] = "archive" \* lines 356-357 pending getArchive await
  /\ LET accepted == id = s.active \/ ~GuardErrors
     IN s' = [s EXCEPT !.phase[id] = "done",
       !.priceError = s.priceError \/ (accepted /\ s.prices = 0),
       !.refreshError = s.refreshError \/ (accepted /\ s.prices > 0),
       !.loading = IF id = s.active THEN FALSE ELSE s.loading,
       !.renderPending = s.renderPending \/ (id = s.active /\ (s.attached \/ ~RespectSuspension)),
       !.stalePublication = s.stalePublication \/ (accepted /\ id # s.active)]

\* Lines 363-369 the live continuation owns prices only if its generation
\* still matches. A navigation token records whether user input happened since start.
\* The token (line 350) sees only navigation that incremented navigationRevision.
\* native is a window the user chose on the mounted chart after the active request
\* began. Line 310 counts it by incrementing navigationRevision.
\* If an interval viewport is still pending (render obscured), its retarget can
\* bring back the earlier range; "auto" then understates preservation, which
\* cannot hide a lost navigation because that requires a navigated request.
LiveArrives(id) ==
  /\ s.phase[id] = "live" \* line 363 pending fetchMarketCandles await
  /\ LET accepted == id = s.active \/ ~GuardResponses
         preserve == PreserveNavigation /\ s.navigated[id]
     IN s' = [s EXCEPT !.phase[id] = "done",
       !.prices = IF accepted THEN id ELSE s.prices,
       !.shownOutdated = s.shownOutdated \/ (accepted /\ s.mounted),
       !.range = IF accepted /\ ~preserve THEN "auto" ELSE s.range,
       !.loading = IF id = s.active THEN FALSE ELSE s.loading,
       !.renderPending = s.renderPending \/ (id = s.active /\ (s.attached \/ ~RespectSuspension)),
       !.stalePublication = s.stalePublication \/ (accepted /\ id # s.active),
       !.native = s.native /\ id # s.active,
       !.lostNavigation = s.lostNavigation \/ (accepted /\ s.navigated[id] /\ s.range = "custom" /\ ~preserve),
       !.lostNative = s.lostNative \/ (accepted /\ id = s.active /\ s.native /\ s.range = "custom" /\ ~preserve)]

\* Lines 371-375 failed live refresh keeps the last valid prices.
LiveFails(id) ==
  /\ s.phase[id] = "live" \* line 363 pending fetchMarketCandles await
  /\ LET accepted == id = s.active \/ ~GuardErrors
     IN s' = [s EXCEPT !.phase[id] = "done",
       !.refreshError = s.refreshError \/ accepted,
       !.native = s.native /\ id # s.active,
       !.loading = IF id = s.active THEN FALSE ELSE s.loading,
       !.renderPending = s.renderPending \/ (id = s.active /\ (s.attached \/ ~RespectSuspension)),
       !.stalePublication = s.stalePublication \/ (accepted /\ id # s.active)]

\* Tracked navigation increments navigationRevision: the workbench go-to range
\* action (line 408, dist/native-chart-workbench.js:242) and the post-await
\* focusHistoricalEvent writer (lines 145-155). onRangeChange (line 109) does too,
\* but getRange (line 108) returns null once a mount exists and bindChartNavigation
\* delivers a range only inside a live scope (dist/chart-navigation.js:86, 225-233),
\* so a drawn chart no longer reaches it. Equality with each captured token
\* becomes false monotonically; booleans abstract this equality exactly for the
\* bounded set of pending requests, not numeric prices. Daily coverage enables the
\* history jump; a cached daily load yields only microtasks. From weekly,
\* ChangeInterval then Pan over-approximates that callback; there is no assumed
\* synchronous load lock or external-event guard inside the await.
Pan ==
  /\ s.ready /\ s.attached /\ s.prices > 0 \* lines 58, 152, 408
  /\ s' = [s EXCEPT !.range = "custom", !.navigated = [i \in Ids |-> TRUE], !.renderPending = TRUE]

\* A zoom or pan on the mounted chart moves the engine's own window, and the mount
\* reports it through onViewport (line 310; src/charts/funnest-chart-runtime.js:391-401).
\* When the window changes, that handler increments navigationRevision and writes
\* state.range. It does not schedule a paint.
NativePan ==
  /\ s.ready /\ s.attached /\ s.mounted \* lines 58, 310
  /\ s' = [s EXCEPT !.range = "custom",
             !.navigated = IF TrackNativeNavigation THEN [i \in Ids |-> TRUE] ELSE s.navigated, \* line 310
             !.native = s.native \/ (s.active > 0 /\ s.phase[s.active] = "live")]

\* The mount also reports windows that move without a gesture, such as a relayout
\* after a click (src/charts/funnest-chart-runtime.js:391-401). setData reports
\* neither its interim window nor the restore (lines 509-518 there). That
\* callback can run after pagehide. Line 310 drops it while suspended; without that
\* guard it writes state.range and refreshes the workbench footer. On a visible
\* page the same report repeats the range that render pushed, which line 310 ignores,
\* or returns to an earlier window, which line 310 counts as navigation. Counting it
\* can only keep a window that LiveArrives would reset, and no invariant requires a
\* reset, so only the suspended report is a step.
ViewportEcho ==
  /\ s.mounted \* src/charts/funnest-chart-runtime.js:392 a destroyed mount is silent
  /\ ~s.attached /\ ~GuardViewport \* line 310
  /\ \E class \in {"auto", "custom"}:
       s' = [s EXCEPT !.range = class, !.hiddenPublication = TRUE]

\* dist/native-chart-workbench.js:85 undo/redo assigns a snapshot of frequency and
\* range, then onRestore (line 409) loads a frequency with no series, and onChange
\* (line 409) increments navigationRevision and schedules. The load captures its
\* token before that increment, so it counts as navigated. A custom range needs a
\* drawn series. Other workbench commands take the same onChange path unchanged.
Restore ==
  /\ s.ready /\ s.attached \* lines 58, 349
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

\* Lines 254-338 a queued render is one synchronous continuation.
Render ==
  /\ s.renderPending \* line 339 scheduled requestAnimationFrame
  /\ ~s.obscured \* line 255
  /\ LET r == [s EXCEPT !.renderPending = FALSE]
     IN s' = IF CanRender THEN Paint(r) ELSE r

\* Line 255 an open replay or center tool consumes the queued frame unpainted.
SkipRender ==
  /\ s.renderPending /\ s.obscured
  /\ s' = [s EXCEPT !.renderPending = FALSE]

\* Lines 429-430 the first load's promise settles even after revocation.
\* The original baseline emitted atlas:ready unconditionally after this callback.
\* The fixed code delegates readiness to guarded render(), with a chart or retry.
InitialFrame ==
  /\ s.phase[1] = "done" /\ ~s.initialDone \* line 430 final initializer await
  /\ LET r == [s EXCEPT !.initialDone = TRUE, !.renderPending = FALSE]
         drawn == IF CanRender /\ ~s.obscured THEN Paint(r) ELSE r
     IN s' = IF BootOnRender THEN drawn
             ELSE [drawn EXCEPT !.ready = TRUE, !.readyCount = drawn.readyCount + 1,
                     !.badReadiness = drawn.badReadiness \/ ~Usable(drawn),
                     !.hiddenPublication = drawn.hiddenPublication \/ ~s.attached]

\* Line 253: a watch on the live mount resolves with painted pixels. The handler
\* clears the chart error, sets state.funnestReady, cancels the tracked frame and
\* calls render() itself. It drops the result while suspended.
PaintConfirmed ==
  /\ s.watching \* line 253 pending mount.ready()
  /\ LET w == [s EXCEPT !.watching = FALSE]
         r == [w EXCEPT !.chartError = FALSE, !.painted = TRUE, !.renderPending = FALSE]
     IN s' = IF ~(s.attached \/ ~GuardPaintSuspension) THEN w
             ELSE IF CanRender /\ ~s.obscured THEN Paint(r) ELSE r

\* Line 253: the watch resolves without painted pixels, or rejects after five
\* unpainted seconds or a canvas read error (src/charts/funnest-chart-runtime.js:482,
\* 496). A throw from render() inside the then handler reaches the same catch.
\* Both handlers record the chart error, announce readiness for the retry and
\* schedule its paint. They drop the result while suspended.
PaintFailed ==
  /\ s.watching \* line 253 pending mount.ready()
  /\ LET w == [s EXCEPT !.watching = FALSE]
     IN s' = IF s.attached \/ ~GuardPaintSuspension
             THEN Scheduled(Announce([w EXCEPT !.chartError = TRUE, !.painted = FALSE]))
             ELSE w

\* A destroyed mount rejects its pending watch (src/charts/funnest-chart-runtime.js:484).
\* Line 253 drops it because state.funnestMount is no longer that mount.
StalePaintFailed ==
  /\ s.staleWatch
  /\ LET w == [s EXCEPT !.staleWatch = FALSE]
     IN s' = IF ~GuardPaintMount /\ (s.attached \/ ~GuardPaintSuspension)
             THEN Scheduled(Announce([w EXCEPT !.chartError = TRUE, !.painted = FALSE,
                                        !.stalePublication = TRUE]))
             ELSE w

\* Lines 413-420 hiding revokes ownership and cancels the tracked frame. A
\* discarded document also destroys the mount (line 419). Hide with no later Show
\* covers it: the live mount can still call back, into the same suspension guards.
Hide ==
  /\ s.issued > 0 \* lines 44-429 no event interleaves before first load
  /\ s.attached \* line 413 browser pagehide event
  /\ s' = [s EXCEPT !.attached = FALSE, !.active = 0, !.loading = FALSE, !.renderPending = FALSE,
             !.native = FALSE]

\* Lines 421-425 a BFCache restoration reloads missing prices, or schedules
\* retained valid prices. No invariant assumes abort prevents late completion.
\* Line 424 starts the paint watch again for a mount that is not confirmed. ready()
\* returns its settled promise until setData (src/charts/funnest-chart-runtime.js), so
\* a confirmation dropped while suspended is read again. A mount needs prices, so the
\* load branch has none.
Show ==
  /\ ~s.attached \* lines 421-425 paired persisted pageshow
  /\ IF s.prices = 0 THEN BeginLoad(FALSE, s.frequency)
     ELSE s' = [s EXCEPT !.attached = TRUE, !.renderPending = TRUE,
                         !.watching = s.watching \/ (s.mounted /\ ~s.painted)] \* line 424

\* Lines 124, 411-412 late layout/font notification, including suspension.
Resize ==
  /\ s.issued > 0 \* lines 44-429 no callback interleaves before first load
  /\ s' = Scheduled(s)

\* dist/chart-replay.js:360 and dist/center-workbench.js:151 take the plot.
Obscure ==
  /\ ~s.obscured
  /\ s' = [s EXCEPT !.obscured = TRUE]

\* dist/chart-replay.js:387-392 exit calls restore, which is schedule (line 410);
\* dist/center-workbench.js:177 closes a center tool without scheduling a paint.
Reveal ==
  /\ s.obscured
  /\ \E scheduled \in BOOLEAN:
       s' = [s EXCEPT !.obscured = FALSE,
              !.renderPending = s.renderPending \/ (scheduled /\ (s.attached \/ ~RespectSuspension))]

Next ==
  \* Lines 44-429 setup and its first load have no intervening await.
  \* Hide/Resize carry this guard so TLC keeps distinct reader action labels.
  Open \/ Refresh \/ ChangeInterval \/ Pan \/ NativePan \/ ViewportEcho \/ Restore
  \/ Render \/ SkipRender \/ InitialFrame \/ PaintConfirmed \/ PaintFailed \/ StalePaintFailed
  \/ Hide \/ Show \/ Resize \/ Obscure \/ Reveal
  \/ \E id \in Ids: ArchiveArrives(id) \/ ArchiveFails(id) \/ LiveArrives(id) \/ LiveFails(id)

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ s.issued \in 0..RequestLimit /\ s.active \in 0..RequestLimit
  /\ s.phase \in [Ids -> Phases] /\ s.forced \in [Ids -> BOOLEAN]
  /\ s.navigated \in [Ids -> BOOLEAN] /\ s.prices \in 0..RequestLimit
  /\ s.frequency \in Intervals /\ s.range \in {"auto", "custom"}
  /\ s.shownFrequency \in Intervals
  /\ s.readyCount \in 0..2
  /\ \A name \in {"attached","loading","priceError","refreshError","renderPending",
                   "ready","initialDone","badReadiness","hiddenPublication",
                   "stalePublication","lostNavigation","lostNative","obscured","urlRange",
                   "mounted","shownOutdated","painted","chartError","watching","staleWatch",
                   "native"}: s[name] \in BOOLEAN

\* Readiness may be announced only when the selected chart has confirmed painted
\* prices or a recorded actionable error. Guarded by lines 251, 253, 280, 337, 430.
ReadyHasUsableView == ~s.badReadiness

\* A suspended page must publish neither chart updates nor readiness, even if an
\* old queued callback runs. Guarded by lines 253, 255, 310, 339, 413-415.
NoHiddenPublication == ~s.hiddenPublication

\* Revoked archive/live successes or failures and a destroyed mount's paint result
\* never write current displayed state.
\* Guarded by lines 253, 356-357, 361, 364, 372, 375, 414.
NoStalePublication == ~s.stalePublication

\* A completed refresh may not reset navigation chosen after that request began.
\* Guarded by lines 109-110, 144, 152, 350, 361, 368-369, 380, 382, 408-409.
NavigationSurvivesRefresh == ~s.lostNavigation

\* The same promise for a window chosen on the mounted chart. Guarded by line 310,
\* which increments navigationRevision when the chart window changes.
NativeNavigationSurvivesRefresh == ~s.lostNative

\* One document announces readiness once, including retry and BFCache restore.
\* Guarded by line 251.
ReadinessOnce == s.readyCount <= 1
=============================================================================
