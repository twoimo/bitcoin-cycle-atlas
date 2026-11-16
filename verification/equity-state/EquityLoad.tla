------------------------------ MODULE EquityLoad ------------------------------
EXTENDS Naturals

\* Line citations refer to dist/equity-view.js at 1722f1fc7aa29edb4f9a9246b15f885bb9e14320
\* unless another file is named.
CONSTANTS RequestLimit, BootOnRender, RespectSuspension, PreserveRange,
          GuardPrices, GuardProjection, GuardErrors, GuardPaint, ClearProjection,
          MarkGesture, RereadPaint
Ids == 1..RequestLimit
Phases == {"unused", "prices", "coin", "paint1", "paint2", "project", "done"}
VARIABLES issued, active, phase, attached, loading, prices, projection,
          priceError, forecastError, renderPending, painted, errorPainted,
          ready, initialFrameDone, staleWrite, hiddenReady, frequency, customRange, range,
          obscured, urlRange, mounted, orphan, funnestReady, chartError, discarded, rangeLost
vars == <<issued, active, phase, attached, loading, prices, projection,
          priceError, forecastError, renderPending, painted, errorPainted,
          ready, initialFrameDone, staleWrite, hiddenReady, frequency, customRange, range,
          obscured, urlRange, mounted, orphan, funnestReady, chartError, discarded, rangeLost>>

\* urlRange: a shared link supplied a date range (line 40, pendingUrlRange) that the
\* first painted series applies. obscured: chart replay or a center tool owns the plot.
\* mounted: a Funnest mount exists (line 197, state.funnestMount). orphan: a destroyed
\* mount may still owe a paint confirmation (line 166, mount.ready()). funnestReady and
\* chartError are state.funnestReady and state.chartError. discarded: Funnest confirmed
\* the paint while the document was suspended, the view returned without acting on
\* that confirmation and the loading shell is still up.
\* painted: the prices of the last render of a chart whose paint Funnest confirmed.
\* The model does not count confirmations or track which series Funnest holds. One may
\* settle whenever a chart is mounted, and a render of a mounted chart may start a watch.
\* range is custom while state.range holds dates the user chose: a go-to, a shared link,
\* a range kept across an interval change, or a pan or zoom on the chart. customRange is
\* state.rangeTouched. rangeLost: a finished projection replaced a custom range.
Init == /\ issued = 0 /\ active = 0 /\ phase = [i \in Ids |-> "unused"]
        /\ attached = TRUE /\ loading = FALSE /\ prices = 0 /\ projection = 0
        /\ priceError = FALSE /\ forecastError = FALSE /\ renderPending = FALSE
        /\ painted = 0 /\ errorPainted = FALSE /\ ready = FALSE
        /\ initialFrameDone = FALSE /\ staleWrite = FALSE /\ hiddenReady = FALSE
        /\ frequency = "daily" /\ customRange = FALSE /\ range = "auto"
        /\ obscured = FALSE /\ urlRange \in BOOLEAN
        /\ mounted = FALSE /\ orphan = FALSE
        /\ funnestReady = FALSE /\ chartError = FALSE /\ discarded = FALSE /\ rangeLost = FALSE

\* A paint with a series consumes the pending URL range (line 195).
UrlApplies == urlRange /\ prices > 0

\* Line 223 load installs a new token, clears the price error and schedules a frame.
StartLoad ==
  /\ issued' = issued + 1 /\ active' = issued + 1
  /\ phase' = [phase EXCEPT ![issued + 1] = "prices"]
  /\ loading' = TRUE /\ priceError' = FALSE /\ renderPending' = TRUE

\* Lines 221-223 load refuses an overlapping load.
\* The finite RequestLimit bounds exploration, not production behavior.
Load ==
  /\ issued < RequestLimit
  /\ ~loading \* line 222
  /\ StartLoad
  /\ UNCHANGED <<prices, projection, forecastError, attached, painted, errorPainted,
                 ready, initialFrameDone, staleWrite, hiddenReady, frequency, customRange, range,
                 obscured, urlRange, mounted, orphan, funnestReady, chartError, discarded, rangeLost>>

\* Line 276 the reload action after a chart error destroys the mount, clears the error
\* and the readiness flag, then calls load(), which returns at line 222 while a load
\* runs. The destroyed mount may still owe a confirmation.
RetryChart ==
  /\ chartError
  /\ loading \/ issued < RequestLimit
  /\ mounted' = FALSE /\ chartError' = FALSE /\ funnestReady' = FALSE /\ discarded' = FALSE
  /\ \E owed \in BOOLEAN: orphan' = (orphan \/ owed)
  /\ IF loading
       THEN UNCHANGED <<issued, active, phase, loading, priceError, renderPending>>
       ELSE StartLoad
  /\ UNCHANGED <<prices, projection, forecastError, attached, painted, errorPainted,
                 ready, initialFrameDone, staleWrite, hiddenReady, frequency, customRange, range,
                 obscured, urlRange, rangeLost>>

\* Lines 225-230 continuation after the equity archive resolves. The T3 gate at
\* lines 229-230 may end an accepted load before the coin request; the finally
\* block at line 247 then clears loading for the current token only.
PricesArrive(id) ==
  /\ phase[id] = "prices"
  /\ \E allowed \in BOOLEAN:
     LET accepted == id = active \/ ~GuardPrices IN \* line 227
     /\ phase' = [phase EXCEPT ![id] = IF accepted /\ allowed THEN "coin" ELSE "done"]
     /\ prices' = IF accepted THEN id ELSE prices
     /\ projection' = IF accepted /\ ClearProjection THEN 0 ELSE projection
     /\ forecastError' = IF accepted THEN FALSE ELSE forecastError
     /\ loading' = IF accepted /\ ~allowed /\ id = active THEN FALSE ELSE loading
     /\ renderPending' = (renderPending \/ (accepted /\ attached))
     /\ staleWrite' = (staleWrite \/ (accepted /\ id # active))
  /\ UNCHANGED <<issued, active, attached, priceError, painted, errorPainted,
                 ready, initialFrameDone, hiddenReady, frequency, customRange, range,
                 obscured, urlRange, mounted, orphan, funnestReady, chartError, discarded, rangeLost>>

\* Lines 246-247 catch/finally after a failed equity archive.
PricesFail(id) ==
  /\ phase[id] = "prices"
  /\ phase' = [phase EXCEPT ![id] = "done"]
  /\ priceError' = IF id = active \/ ~GuardErrors THEN TRUE ELSE priceError
  /\ staleWrite' = (staleWrite \/ (~GuardErrors /\ id # active))
  /\ loading' = IF id = active THEN FALSE ELSE loading
  /\ renderPending' = (renderPending \/ (id = active /\ attached))
  /\ UNCHANGED <<issued, active, attached, prices, projection, forecastError, painted, errorPainted,
                 ready, initialFrameDone, hiddenReady, frequency, customRange, range,
                 obscured, urlRange, mounted, orphan, funnestReady, chartError, discarded, rangeLost>>

\* Lines 232-235 coin continuation and first scheduled paint yield.
CoinArrives(id) ==
  /\ phase[id] = "coin"
  /\ phase' = [phase EXCEPT ![id] = IF id = active THEN "paint1" ELSE "done"] \* line 233
  /\ UNCHANGED <<issued, active, attached, loading, prices, projection, priceError, forecastError,
                 renderPending, painted, errorPainted, ready, initialFrameDone, staleWrite,
                 hiddenReady, frequency, customRange, range, obscured, urlRange,
                 mounted, orphan, funnestReady, chartError, discarded, rangeLost>>

\* Lines 232, 245 and 247 a coin archive failure keeps observed prices.
CoinFails(id) ==
  /\ phase[id] = "coin"
  /\ phase' = [phase EXCEPT ![id] = "done"]
  /\ projection' = IF id = active \/ ~GuardErrors THEN 0 ELSE projection
  /\ forecastError' = IF id = active \/ ~GuardErrors THEN TRUE ELSE forecastError
  /\ staleWrite' = (staleWrite \/ (~GuardErrors /\ id # active))
  /\ loading' = IF id = active THEN FALSE ELSE loading
  /\ renderPending' = (renderPending \/ (id = active /\ attached))
  /\ UNCHANGED <<issued, active, attached, prices, priceError, painted, errorPainted,
                 ready, initialFrameDone, hiddenReady, frequency, customRange, range,
                 obscured, urlRange, mounted, orphan, funnestReady, chartError, discarded, rangeLost>>

\* Line 235 the first requestAnimationFrame queues the second.
FirstPaint(id) ==
  /\ phase[id] = "paint1"
  /\ phase' = [phase EXCEPT ![id] = "paint2"]
  /\ UNCHANGED <<issued, active, attached, loading, prices, projection, priceError, forecastError,
                 renderPending, painted, errorPainted, ready, initialFrameDone, staleWrite,
                 hiddenReady, frequency, customRange, range, obscured, urlRange,
                 mounted, orphan, funnestReady, chartError, discarded, rangeLost>>

\* Line 235 the second requestAnimationFrame resolves the yield.
SecondPaint(id) ==
  /\ phase[id] = "paint2"
  /\ phase' = [phase EXCEPT ![id] = "project"]
  /\ UNCHANGED <<issued, active, attached, loading, prices, projection, priceError, forecastError,
                 renderPending, painted, errorPainted, ready, initialFrameDone, staleWrite,
                 hiddenReady, frequency, customRange, range, obscured, urlRange,
                 mounted, orphan, funnestReady, chartError, discarded, rangeLost>>

\* Lines 236-244 and 247 synchronous computation/publication after both yields.
\* Line 244 keeps the range only while state.rangeTouched is set.
Project(id) ==
  /\ phase[id] = "project"
  /\ phase' = [phase EXCEPT ![id] = "done"]
  /\ projection' = IF id = active \/ ~GuardProjection THEN id ELSE projection \* line 236
  /\ staleWrite' = (staleWrite \/ (~GuardProjection /\ id # active))
  /\ LET reset == (id = active \/ ~GuardProjection) /\ (~customRange \/ ~PreserveRange) IN \* line 244
     /\ range' = IF reset THEN "auto" ELSE range
     /\ rangeLost' = (rangeLost \/ (reset /\ range = "custom"))
  /\ loading' = IF id = active THEN FALSE ELSE loading
  /\ renderPending' = (renderPending \/ (id = active /\ attached))
  /\ UNCHANGED <<issued, active, attached, prices, priceError, forecastError, painted, errorPainted,
                 ready, initialFrameDone, hiddenReady, frequency, customRange, obscured, urlRange,
                 mounted, orphan, funnestReady, chartError, discarded>>

\* Lines 237-245 synchronous calculation may throw into the same catch.
ProjectFails(id) ==
  /\ phase[id] = "project"
  /\ (id = active \/ ~GuardProjection) \* line 236
  /\ phase' = [phase EXCEPT ![id] = "done"]
  /\ projection' = IF id = active \/ ~GuardErrors THEN 0 ELSE projection
  /\ forecastError' = IF id = active \/ ~GuardErrors THEN TRUE ELSE forecastError
  /\ staleWrite' = (staleWrite \/ (~GuardErrors /\ id # active))
  /\ loading' = IF id = active THEN FALSE ELSE loading
  /\ renderPending' = (renderPending \/ (id = active /\ attached))
  /\ UNCHANGED <<issued, active, attached, prices, priceError, painted, errorPainted,
                 ready, initialFrameDone, hiddenReady, frequency, customRange, range,
                 obscured, urlRange, mounted, orphan, funnestReady, chartError, discarded, rangeLost>>

\* Line 187 render returns before any write while the document is suspended or replay
\* or a center tool owns the plot.
CanRender == (attached \/ ~RespectSuspension) /\ ~obscured

\* Lines 187-211 the rest of render() is one synchronous body with three callers: the
\* scheduled frame (line 212), the paint confirmation (line 166) and the last
\* initialization frame (line 288). confirmed and failed are state.funnestReady and
\* state.chartError on entry, dropped is discarded on entry, legacy is the original
\* boot order's unconditional release and visible says that the document is attached
\* when the body runs.
\* Without a series, line 187 releases only for a price error. No mount exists then,
\* because prices never clear. With a series, line 197 mounts Funnest or hands a
\* mounted chart a changed series. Each starts a watch that clears state.funnestReady
\* (line 166). Line 211 releases only while that flag is set, so a chart whose
\* confirmation the view has not acted on is rendered without a release.
RenderBody(confirmed, failed, dropped, legacy, visible) ==
  LET series == prices > 0 \* line 187 current()
      apply == UrlApplies
  IN \E watch \in IF ~series THEN {FALSE} ELSE IF mounted THEN BOOLEAN ELSE {TRUE}: \* line 197
       LET usable == series /\ confirmed /\ ~watch
           shown == usable \/ (series /\ dropped /\ ~watch)
           release == legacy \/ (BootOnRender /\ IF series THEN usable ELSE priceError)
       IN /\ painted' = IF shown THEN prices ELSE painted
          /\ errorPainted' = IF series THEN failed ELSE priceError
          /\ ready' = (ready \/ release)
          /\ hiddenReady' = (hiddenReady \/ (~ready /\ release /\ ~visible))
          /\ funnestReady' = IF series THEN usable ELSE confirmed
          /\ discarded' = (dropped /\ ~watch /\ ~release)
          /\ mounted' = (mounted \/ series)
          /\ urlRange' = (urlRange /\ ~apply)
          /\ customRange' = (customRange \/ apply)
          /\ range' = IF apply THEN "custom" ELSE range

\* Line 212 schedule queues render for the next frame.
Render ==
  /\ renderPending /\ CanRender
  /\ renderPending' = FALSE
  /\ RenderBody(funnestReady, chartError, discarded, FALSE, attached)
  /\ UNCHANGED <<issued, active, phase, attached, loading, prices, projection, priceError,
                 forecastError, initialFrameDone, staleWrite, frequency, obscured,
                 orphan, chartError, rangeLost>>

\* Line 187 an open replay or center tool consumes the queued frame unpainted.
SkipRender ==
  /\ renderPending /\ obscured
  /\ renderPending' = FALSE
  /\ UNCHANGED <<issued, active, phase, attached, loading, prices, projection, priceError,
                 forecastError, painted, errorPainted, ready, initialFrameDone, staleWrite,
                 hiddenReady, frequency, customRange, range, obscured, urlRange,
                 mounted, orphan, funnestReady, chartError, discarded, rangeLost>>

\* Line 288 the original init continuation still has one final RAF, whose render()
\* may complete after pagehide; render checks suspension and plot ownership first.
InitialFrame ==
  /\ issued > 0 \* line 288
  /\ phase[1] = "done" \* line 288
  /\ ~initialFrameDone
  /\ initialFrameDone' = TRUE
  /\ IF CanRender
       THEN RenderBody(funnestReady, chartError, discarded, ~BootOnRender, attached)
       ELSE UNCHANGED <<painted, errorPainted, ready, hiddenReady, funnestReady, discarded,
                        mounted, urlRange, customRange, range>>
  /\ UNCHANGED <<issued, active, phase, attached, loading, prices, projection, priceError,
                 forecastError, renderPending, staleWrite, frequency, obscured,
                 orphan, chartError, rangeLost>>

\* Line 166 mount.ready() resolves with painted pixels for the current mount
\* (src/charts/funnest-chart-runtime.js:495). The continuation returns while the
\* document is suspended and keeps no record of the confirmation. Show reads that
\* result again. Otherwise the continuation clears the chart error, sets
\* state.funnestReady, cancels the queued frame and calls render() itself.
PaintConfirmed ==
  /\ mounted
  /\ IF attached \/ ~GuardPaint \* line 166
       THEN /\ chartError' = FALSE /\ renderPending' = FALSE
            /\ IF CanRender
                 THEN RenderBody(TRUE, FALSE, FALSE, FALSE, attached)
                 ELSE /\ funnestReady' = TRUE /\ discarded' = FALSE
                      /\ UNCHANGED <<painted, errorPainted, ready, hiddenReady, mounted,
                                     urlRange, customRange, range>>
       ELSE /\ discarded' = ~ready
            /\ UNCHANGED <<chartError, renderPending, painted, errorPainted, ready, hiddenReady,
                           funnestReady, mounted, urlRange, customRange, range>>
  /\ UNCHANGED <<issued, active, phase, attached, loading, prices, projection, priceError,
                 forecastError, initialFrameDone, staleWrite, frequency, obscured,
                 orphan, rangeLost>>

\* Line 166 the .catch continuation: ready() rejects for the current mount at the
\* runtime's five-second limit or on a canvas read error
\* (src/charts/funnest-chart-runtime.js:482, 496). The .then branch without painted
\* pixels writes the same. Both return while the document is suspended. Otherwise they
\* publish the chart error and readiness directly, then schedule.
PaintFails ==
  /\ mounted
  /\ LET runs == attached \/ ~GuardPaint IN \* line 166
     /\ chartError' = (chartError \/ runs)
     /\ funnestReady' = (funnestReady /\ ~runs)
     /\ ready' = (ready \/ runs)
     /\ hiddenReady' = (hiddenReady \/ (runs /\ ~ready /\ ~attached))
     /\ renderPending' = (renderPending \/ (runs /\ attached)) \* line 212
  /\ discarded' = FALSE
  /\ UNCHANGED <<issued, active, phase, attached, loading, prices, projection, priceError,
                 forecastError, painted, errorPainted, initialFrameDone, staleWrite,
                 frequency, customRange, range, obscured, urlRange, mounted, orphan, rangeLost>>

\* src/charts/funnest-chart-runtime.js:484 a destroyed mount rejects its pending
\* ready(). Line 166 compares state.funnestMount with the mount that owns the
\* continuation and returns.
OrphanSettles ==
  /\ orphan /\ orphan' = FALSE
  /\ LET runs == ~GuardPaint IN \* line 166
     /\ chartError' = (chartError \/ runs)
     /\ funnestReady' = (funnestReady /\ ~runs)
     /\ ready' = (ready \/ runs)
     /\ hiddenReady' = (hiddenReady \/ (runs /\ ~ready /\ ~attached))
     /\ renderPending' = (renderPending \/ (runs /\ attached))
     /\ staleWrite' = (staleWrite \/ runs)
     /\ discarded' = (discarded /\ ~runs)
  /\ UNCHANGED <<issued, active, phase, attached, loading, prices, projection, priceError,
                 forecastError, painted, errorPainted, initialFrameDone,
                 frequency, customRange, range, obscured, urlRange, mounted, rangeLost>>

\* Line 284 pagehide revokes the token even if abort is ignored. A persisted hide
\* keeps the mount. A hide that is not persisted also destroys it. That document is
\* unloaded and stays suspended, so its continuations are the suspended ones here.
Hide ==
  /\ attached
  /\ attached' = FALSE /\ active' = 0 /\ loading' = FALSE /\ renderPending' = FALSE
  /\ UNCHANGED <<issued, phase, prices, projection, priceError, forecastError, painted,
                 errorPainted, ready, initialFrameDone, staleWrite, hiddenReady, frequency, customRange, range,
                 obscured, urlRange, mounted, orphan, funnestReady, chartError, discarded, rangeLost>>

\* Line 285 pageshow resumes the document; Load models a missing projection retry.
\* With a mounted chart whose paint is not confirmed, it first starts the paint watch
\* again (line 166). mount.ready() returns its settled promise until the data changes
\* (src/charts/funnest-chart-runtime.js:478-480 and 519), so the continuation for a
\* confirmation that arrived while suspended runs in the same task, before any frame.
\* It cancels the frame that the handler queued and calls render() itself. A failure
\* that arrived while suspended is read the same way. PaintFails after Show covers it.
Show ==
  /\ attached' = TRUE
  /\ IF RereadPaint /\ mounted /\ ~funnestReady /\ discarded \* line 285
       THEN /\ chartError' = FALSE /\ renderPending' = FALSE
            /\ IF ~obscured \* line 187
                 THEN RenderBody(TRUE, FALSE, FALSE, FALSE, TRUE)
                 ELSE /\ funnestReady' = TRUE /\ discarded' = FALSE
                      /\ UNCHANGED <<painted, errorPainted, ready, hiddenReady, mounted,
                                     urlRange, customRange, range>>
       ELSE /\ renderPending' = TRUE
            /\ UNCHANGED <<chartError, painted, errorPainted, ready, hiddenReady, funnestReady,
                           discarded, mounted, urlRange, customRange, range>>
  /\ UNCHANGED <<issued, active, phase, loading, prices, projection, priceError, forecastError,
                 initialFrameDone, staleWrite, frequency, obscured, orphan, rangeLost>>

\* The workbench go-to command (dist/native-chart-workbench.js:242) and the event and
\* forecast jumps (lines 88 and 95) set the range and rangeTouched independently of
\* pending input. Line 73 onRangeChange does the same, but dist/chart-navigation.js
\* publishes no range while getRange returns null for a mounted chart.
Pan ==
  /\ customRange' = TRUE /\ range' = "custom" /\ renderPending' = TRUE
  /\ UNCHANGED <<issued, active, phase, attached, loading, prices, projection, priceError,
                 forecastError, painted, errorPainted, ready, initialFrameDone, staleWrite, hiddenReady, frequency,
                 obscured, urlRange, mounted, orphan, funnestReady, chartError, discarded, rangeLost>>

\* Line 197 onViewport: Funnest reports the visible range after a wheel, drag or key
\* gesture (src/charts/funnest-chart-runtime.js:391-401 and 414-441). The report that
\* follows such a gesture makes userOwnsRange() true (line 399 there), and setRange
\* takes it back (lines 477 and 521 there). A click, a relayout or setData does not.
\* setData reports neither its interim window nor the restore (lines 509-518 there).
\* The callback returns while the document is suspended, and while state.range is null
\* before the render that rebuilds it (e8873b88). range "auto" covers that state too,
\* so a dropped report is a NativePan that did not happen. Otherwise it stores the
\* reported start and end in state.range, and sets state.rangeTouched while
\* userOwnsRange() holds. It does not schedule. The boot script keeps the app inert
\* until ready (dist/index.html, ready()).
\* Funnest reports its own range changes through the same callback. This model has no
\* step for those reports.
NativePan ==
  /\ mounted /\ attached /\ ready
  /\ range' = "custom" /\ customRange' = (customRange \/ MarkGesture)
  /\ UNCHANGED <<issued, active, phase, attached, loading, prices, projection, priceError,
                 forecastError, renderPending, painted, errorPainted, ready, initialFrameDone,
                 staleWrite, hiddenReady, frequency, obscured, urlRange,
                 mounted, orphan, funnestReady, chartError, discarded, rangeLost>>

\* Lines 265-273 an interval change retargets the previous visible range and marks it
\* touched when one existed (tests/equity-viewport-interval.test.mjs). A touched or custom
\* range is never null, so it always carries over. No calculation restarts.
ChangeInterval ==
  /\ frequency' = IF frequency = "daily" THEN "weekly" ELSE "daily"
  /\ \E kept \in IF customRange \/ range = "custom" THEN {TRUE} ELSE BOOLEAN:
       customRange' = kept /\ range' = IF kept THEN "custom" ELSE "auto"
  /\ renderPending' = TRUE
  /\ UNCHANGED <<issued, active, phase, attached, loading, prices, projection, priceError,
                 forecastError, painted, errorPainted, ready, initialFrameDone, staleWrite, hiddenReady,
                 obscured, urlRange, mounted, orphan, funnestReady, chartError, discarded, rangeLost>>

\* dist/native-chart-workbench.js:86 undo/redo assigns a snapshot of frequency, range
\* and rangeTouched that the code wrote together, then onChange persists and schedules
\* (line 281). No request starts. changeSpan/resetRange (lines 274-275) write the same
\* untouched pair.
Restore ==
  /\ \E f \in {"daily", "weekly"}, kept \in BOOLEAN:
       /\ frequency' = f
       /\ customRange' = kept /\ range' = IF kept THEN "custom" ELSE "auto"
  /\ renderPending' = TRUE
  /\ UNCHANGED <<issued, active, phase, attached, loading, prices, projection, priceError,
                 forecastError, painted, errorPainted, ready, initialFrameDone, staleWrite, hiddenReady,
                 obscured, urlRange, mounted, orphan, funnestReady, chartError, discarded, rangeLost>>

\* dist/chart-replay.js:360 and dist/center-workbench.js:151 take the plot.
Obscure ==
  /\ ~obscured /\ obscured' = TRUE
  /\ UNCHANGED <<issued, active, phase, attached, loading, prices, projection, priceError,
                 forecastError, renderPending, painted, errorPainted, ready, initialFrameDone,
                 staleWrite, hiddenReady, frequency, customRange, range, urlRange,
                 mounted, orphan, funnestReady, chartError, discarded, rangeLost>>

\* dist/chart-replay.js:387-392 exit calls restore, which is schedule (line 282);
\* dist/center-workbench.js:177 closes a center tool without scheduling a paint.
Reveal ==
  /\ obscured /\ obscured' = FALSE
  /\ \E scheduled \in BOOLEAN: renderPending' = (renderPending \/ (scheduled /\ attached))
  /\ UNCHANGED <<issued, active, phase, attached, loading, prices, projection, priceError,
                 forecastError, painted, errorPainted, ready, initialFrameDone,
                 staleWrite, hiddenReady, frequency, customRange, range, urlRange,
                 mounted, orphan, funnestReady, chartError, discarded, rangeLost>>

System == (\E id \in Ids: PricesArrive(id) \/ PricesFail(id) \/ CoinArrives(id) \/ CoinFails(id)
                            \/ FirstPaint(id) \/ SecondPaint(id) \/ Project(id) \/ ProjectFails(id))
          \/ Render \/ SkipRender \/ InitialFrame \/ PaintConfirmed \/ PaintFails \/ OrphanSettles
Next == Load \/ RetryChart \/ Hide \/ Show \/ Pan \/ NativePan \/ ChangeInterval \/ Restore
        \/ Obscure \/ Reveal \/ System
Spec == Init /\ [][Next]_vars

\* A chart failure is explored while the request bound still leaves a load for its
\* retry. TLC checks every rule in a state past this bound but does not continue from it.
FailureScope == (chartError \/ orphan) => issued < RequestLimit

TypeOK == /\ issued \in 0..RequestLimit /\ active \in 0..issued
          /\ phase \in [Ids -> Phases] /\ prices \in 0..issued /\ projection \in 0..issued
          /\ painted \in 0..issued /\ frequency \in {"daily", "weekly"}
          /\ range \in {"auto", "custom"}
          /\ <<attached, loading, priceError, forecastError, renderPending, errorPainted,
                ready, initialFrameDone, staleWrite, hiddenReady, customRange,
                obscured, urlRange, mounted, orphan, funnestReady, chartError, discarded, rangeLost>> \in [1..19 -> BOOLEAN]

\* A revoked load or a destroyed chart never publishes prices, forecast values, or errors.
NoStalePublication == ~staleWrite
\* A published projection uses the same request generation as its displayed prices.
ProjectionMatchesPrices == projection = 0 \/ projection = prices
\* A render of a chart whose paint Funnest confirmed, or of an actionable error,
\* releases the loading shell immediately.
UsableRenderReleasesBoot == (painted > 0 \/ errorPainted) => ready
\* A suspended document never publishes its first ready event.
NoHiddenReadiness == ~hiddenReady
\* Pending computation preserves the latest user range unless the user resets it.
UserRangePreserved == ~rangeLost /\ (customRange => range = "custom")
=============================================================================
