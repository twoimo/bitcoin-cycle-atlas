------------------------------ MODULE EquityLoad ------------------------------
EXTENDS Naturals

\* Line citations refer to dist/equity-view.js at fe93a5727277d15a934b7472588fb907e30b02b8
\* unless another file is named.
CONSTANTS RequestLimit, BootOnRender, RespectSuspension, PreserveRange,
          GuardPrices, GuardProjection, GuardErrors, ClearProjection
Ids == 1..RequestLimit
Phases == {"unused", "prices", "coin", "paint1", "paint2", "project", "done"}
VARIABLES issued, active, phase, attached, loading, prices, projection,
          priceError, forecastError, renderPending, painted, errorPainted,
          ready, initialFrameDone, staleWrite, hiddenReady, frequency, customRange, range,
          obscured, urlRange
vars == <<issued, active, phase, attached, loading, prices, projection,
          priceError, forecastError, renderPending, painted, errorPainted,
          ready, initialFrameDone, staleWrite, hiddenReady, frequency, customRange, range,
          obscured, urlRange>>

\* urlRange: a shared link supplied a date range (line 38, pendingUrlRange) that the
\* first painted series applies. obscured: chart replay or a center tool owns the plot.
Init == /\ issued = 0 /\ active = 0 /\ phase = [i \in Ids |-> "unused"]
        /\ attached = TRUE /\ loading = FALSE /\ prices = 0 /\ projection = 0
        /\ priceError = FALSE /\ forecastError = FALSE /\ renderPending = FALSE
        /\ painted = 0 /\ errorPainted = FALSE /\ ready = FALSE
        /\ initialFrameDone = FALSE /\ staleWrite = FALSE /\ hiddenReady = FALSE
        /\ frequency = "daily" /\ customRange = FALSE /\ range = "auto"
        /\ obscured = FALSE /\ urlRange \in BOOLEAN

\* A paint with a series consumes the pending URL range (line 145).
UrlApplies == urlRange /\ prices > 0

\* Lines 157-159 load refuses an overlapping load.
\* The finite RequestLimit bounds exploration, not production behavior.
Load ==
  /\ issued < RequestLimit
  /\ ~loading \* line 158
  /\ issued' = issued + 1 /\ active' = issued + 1
  /\ phase' = [phase EXCEPT ![issued + 1] = "prices"]
  /\ loading' = TRUE /\ priceError' = FALSE /\ renderPending' = TRUE
  /\ UNCHANGED <<prices, projection, forecastError, attached, painted, errorPainted,
                 ready, initialFrameDone, staleWrite, hiddenReady, frequency, customRange, range,
                 obscured, urlRange>>

\* Lines 161-166 continuation after the equity archive resolves. The T3 gate at
\* lines 165-166 may end an accepted load before the coin request; the finally
\* block at line 183 then clears loading for the current token only.
PricesArrive(id) ==
  /\ phase[id] = "prices"
  /\ \E allowed \in BOOLEAN:
     LET accepted == id = active \/ ~GuardPrices IN \* line 163
     /\ phase' = [phase EXCEPT ![id] = IF accepted /\ allowed THEN "coin" ELSE "done"]
     /\ prices' = IF accepted THEN id ELSE prices
     /\ projection' = IF accepted /\ ClearProjection THEN 0 ELSE projection
     /\ forecastError' = IF accepted THEN FALSE ELSE forecastError
     /\ loading' = IF accepted /\ ~allowed /\ id = active THEN FALSE ELSE loading
     /\ renderPending' = (renderPending \/ (accepted /\ attached))
     /\ staleWrite' = (staleWrite \/ (accepted /\ id # active))
  /\ UNCHANGED <<issued, active, attached, priceError, painted, errorPainted,
                 ready, initialFrameDone, hiddenReady, frequency, customRange, range,
                 obscured, urlRange>>

\* Lines 182-183 catch/finally after a failed equity archive.
PricesFail(id) ==
  /\ phase[id] = "prices"
  /\ phase' = [phase EXCEPT ![id] = "done"]
  /\ priceError' = IF id = active \/ ~GuardErrors THEN TRUE ELSE priceError
  /\ staleWrite' = (staleWrite \/ (~GuardErrors /\ id # active))
  /\ loading' = IF id = active THEN FALSE ELSE loading
  /\ renderPending' = (renderPending \/ (id = active /\ attached))
  /\ UNCHANGED <<issued, active, attached, prices, projection, forecastError, painted, errorPainted,
                 ready, initialFrameDone, hiddenReady, frequency, customRange, range,
                 obscured, urlRange>>

\* Lines 168-171 coin continuation and first scheduled paint yield.
CoinArrives(id) ==
  /\ phase[id] = "coin"
  /\ phase' = [phase EXCEPT ![id] = IF id = active THEN "paint1" ELSE "done"] \* line 169
  /\ UNCHANGED <<issued, active, attached, loading, prices, projection, priceError, forecastError,
                 renderPending, painted, errorPainted, ready, initialFrameDone, staleWrite,
                 hiddenReady, frequency, customRange, range, obscured, urlRange>>

\* Lines 168, 181 and 183 a coin archive failure keeps observed prices.
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
                 obscured, urlRange>>

\* Line 171 the first requestAnimationFrame queues the second.
FirstPaint(id) ==
  /\ phase[id] = "paint1"
  /\ phase' = [phase EXCEPT ![id] = "paint2"]
  /\ UNCHANGED <<issued, active, attached, loading, prices, projection, priceError, forecastError,
                 renderPending, painted, errorPainted, ready, initialFrameDone, staleWrite,
                 hiddenReady, frequency, customRange, range, obscured, urlRange>>

\* Line 171 the second requestAnimationFrame resolves the yield.
SecondPaint(id) ==
  /\ phase[id] = "paint2"
  /\ phase' = [phase EXCEPT ![id] = "project"]
  /\ UNCHANGED <<issued, active, attached, loading, prices, projection, priceError, forecastError,
                 renderPending, painted, errorPainted, ready, initialFrameDone, staleWrite,
                 hiddenReady, frequency, customRange, range, obscured, urlRange>>

\* Lines 172-180 and 183 synchronous computation/publication after both yields.
Project(id) ==
  /\ phase[id] = "project"
  /\ phase' = [phase EXCEPT ![id] = "done"]
  /\ projection' = IF id = active \/ ~GuardProjection THEN id ELSE projection \* line 172
  /\ staleWrite' = (staleWrite \/ (~GuardProjection /\ id # active))
  /\ range' = IF (id = active \/ ~GuardProjection) /\ (~customRange \/ ~PreserveRange) THEN "auto" ELSE range \* line 180
  /\ loading' = IF id = active THEN FALSE ELSE loading
  /\ renderPending' = (renderPending \/ (id = active /\ attached))
  /\ UNCHANGED <<issued, active, attached, prices, priceError, forecastError, painted, errorPainted,
                 ready, initialFrameDone, hiddenReady, frequency, customRange, obscured, urlRange>>

\* Lines 173-181 synchronous calculation may throw into the same catch.
ProjectFails(id) ==
  /\ phase[id] = "project"
  /\ (id = active \/ ~GuardProjection) \* line 172
  /\ phase' = [phase EXCEPT ![id] = "done"]
  /\ projection' = IF id = active \/ ~GuardErrors THEN 0 ELSE projection
  /\ forecastError' = IF id = active \/ ~GuardErrors THEN TRUE ELSE forecastError
  /\ staleWrite' = (staleWrite \/ (~GuardErrors /\ id # active))
  /\ loading' = IF id = active THEN FALSE ELSE loading
  /\ renderPending' = (renderPending \/ (id = active /\ attached))
  /\ UNCHANGED <<issued, active, attached, prices, priceError, painted, errorPainted,
                 ready, initialFrameDone, hiddenReady, frequency, customRange, range,
                 obscured, urlRange>>

\* Lines 136-147 render plus one-shot readiness, same JS continuation.
Render ==
  /\ renderPending
  /\ ~obscured \* line 137
  /\ (attached \/ ~RespectSuspension) \* line 137
  /\ renderPending' = FALSE /\ painted' = prices /\ errorPainted' = priceError
  /\ ready' = (ready \/ (BootOnRender /\ (prices > 0 \/ priceError)))
  /\ hiddenReady' = (hiddenReady \/ (~ready /\ BootOnRender /\ (prices > 0 \/ priceError) /\ ~attached))
  /\ urlRange' = (urlRange /\ ~UrlApplies)
  /\ customRange' = (customRange \/ UrlApplies)
  /\ range' = IF UrlApplies THEN "custom" ELSE range
  /\ UNCHANGED <<issued, active, phase, attached, loading, prices, projection, priceError,
                 forecastError, initialFrameDone, staleWrite, frequency, obscured>>

\* Line 137 an open replay or center tool consumes the queued frame unpainted.
SkipRender ==
  /\ renderPending /\ obscured
  /\ renderPending' = FALSE
  /\ UNCHANGED <<issued, active, phase, attached, loading, prices, projection, priceError,
                 forecastError, painted, errorPainted, ready, initialFrameDone, staleWrite,
                 hiddenReady, frequency, customRange, range, obscured, urlRange>>

\* Line 224 the original init continuation still has one final RAF, whose render()
\* may complete after pagehide; render checks suspension and plot ownership first.
InitialFrame ==
  /\ issued > 0 \* line 224
  /\ phase[1] = "done" \* line 224
  /\ ~initialFrameDone
  /\ initialFrameDone' = TRUE
  /\ LET canRender == (attached \/ ~RespectSuspension) /\ ~obscured
         release == canRender /\ (~BootOnRender \/ prices > 0 \/ priceError)
         apply == canRender /\ UrlApplies IN
     /\ painted' = IF canRender THEN prices ELSE painted
     /\ errorPainted' = IF canRender THEN priceError ELSE errorPainted
     /\ ready' = (ready \/ release)
     /\ hiddenReady' = (hiddenReady \/ (~ready /\ release /\ ~attached))
     /\ urlRange' = (urlRange /\ ~apply)
     /\ customRange' = (customRange \/ apply)
     /\ range' = IF apply THEN "custom" ELSE range
  /\ UNCHANGED <<issued, active, phase, attached, loading, prices, projection, priceError,
                 forecastError, renderPending, staleWrite, frequency, obscured>>

\* Line 220 pagehide revokes the token even if abort is ignored.
Hide ==
  /\ attached
  /\ attached' = FALSE /\ active' = 0 /\ loading' = FALSE /\ renderPending' = FALSE
  /\ UNCHANGED <<issued, phase, prices, projection, priceError, forecastError, painted,
                 errorPainted, ready, initialFrameDone, staleWrite, hiddenReady, frequency, customRange, range,
                 obscured, urlRange>>

\* Line 221 pageshow resumes the document; Load models a missing projection retry.
Show ==
  /\ attached' = TRUE /\ renderPending' = TRUE
  /\ UNCHANGED <<issued, active, phase, loading, prices, projection, priceError, forecastError,
                 painted, errorPainted, ready, initialFrameDone, staleWrite, hiddenReady,
                 frequency, customRange, range, obscured, urlRange>>

\* Line 69 user pan, and the workbench go-to command (dist/native-chart-workbench.js:238),
\* set the range and rangeTouched independently of pending input.
Pan ==
  /\ customRange' = TRUE /\ range' = "custom" /\ renderPending' = TRUE
  /\ UNCHANGED <<issued, active, phase, attached, loading, prices, projection, priceError,
                 forecastError, painted, errorPainted, ready, initialFrameDone, staleWrite, hiddenReady, frequency,
                 obscured, urlRange>>

\* Lines 201-208 an interval change retargets the previous visible range and marks it
\* touched when one existed (tests/native-chart-viewport.test.mjs). A touched range
\* is never null, so it always carries over. No calculation restarts.
ChangeInterval ==
  /\ frequency' = IF frequency = "daily" THEN "weekly" ELSE "daily"
  /\ \E kept \in IF customRange THEN {TRUE} ELSE BOOLEAN:
       customRange' = kept /\ range' = IF kept THEN "custom" ELSE "auto"
  /\ renderPending' = TRUE
  /\ UNCHANGED <<issued, active, phase, attached, loading, prices, projection, priceError,
                 forecastError, painted, errorPainted, ready, initialFrameDone, staleWrite, hiddenReady,
                 obscured, urlRange>>

\* dist/native-chart-workbench.js:82 undo/redo assigns a snapshot of frequency, range
\* and rangeTouched that the code wrote together, then onChange persists and schedules
\* (line 217). No request starts. changeSpan/resetRange (lines 210-211) write the same
\* untouched pair.
Restore ==
  /\ \E f \in {"daily", "weekly"}, kept \in BOOLEAN:
       /\ frequency' = f
       /\ customRange' = kept /\ range' = IF kept THEN "custom" ELSE "auto"
  /\ renderPending' = TRUE
  /\ UNCHANGED <<issued, active, phase, attached, loading, prices, projection, priceError,
                 forecastError, painted, errorPainted, ready, initialFrameDone, staleWrite, hiddenReady,
                 obscured, urlRange>>

\* dist/chart-replay.js:345 and dist/center-workbench.js:151 take the plot.
Obscure ==
  /\ ~obscured /\ obscured' = TRUE
  /\ UNCHANGED <<issued, active, phase, attached, loading, prices, projection, priceError,
                 forecastError, renderPending, painted, errorPainted, ready, initialFrameDone,
                 staleWrite, hiddenReady, frequency, customRange, range, urlRange>>

\* dist/chart-replay.js:371-376 exit calls restore, which is schedule (line 218);
\* dist/center-workbench.js:177 closes a center tool without scheduling a paint.
Reveal ==
  /\ obscured /\ obscured' = FALSE
  /\ \E scheduled \in BOOLEAN: renderPending' = (renderPending \/ (scheduled /\ attached))
  /\ UNCHANGED <<issued, active, phase, attached, loading, prices, projection, priceError,
                 forecastError, painted, errorPainted, ready, initialFrameDone,
                 staleWrite, hiddenReady, frequency, customRange, range, urlRange>>

System == (\E id \in Ids: PricesArrive(id) \/ PricesFail(id) \/ CoinArrives(id) \/ CoinFails(id)
                            \/ FirstPaint(id) \/ SecondPaint(id) \/ Project(id) \/ ProjectFails(id))
          \/ Render \/ SkipRender \/ InitialFrame
Next == Load \/ Hide \/ Show \/ Pan \/ ChangeInterval \/ Restore \/ Obscure \/ Reveal \/ System
Spec == Init /\ [][Next]_vars

TypeOK == /\ issued \in 0..RequestLimit /\ active \in 0..issued
          /\ phase \in [Ids -> Phases] /\ prices \in 0..issued /\ projection \in 0..issued
          /\ painted \in 0..issued /\ frequency \in {"daily", "weekly"}
          /\ range \in {"auto", "custom"}
          /\ <<attached, loading, priceError, forecastError, renderPending, errorPainted,
                ready, initialFrameDone, staleWrite, hiddenReady, customRange,
                obscured, urlRange>> \in [1..13 -> BOOLEAN]

\* A revoked load never publishes prices, forecast values, or errors.
NoStalePublication == ~staleWrite
\* A published projection uses the same request generation as its displayed prices.
ProjectionMatchesPrices == projection = 0 \/ projection = prices
\* An observed or actionable-error render releases the loading shell immediately.
UsableRenderReleasesBoot == (painted > 0 \/ errorPainted) => ready
\* A suspended document never publishes its first ready event.
NoHiddenReadiness == ~hiddenReady
\* Pending computation preserves the latest user range unless the user resets it.
UserRangePreserved == customRange => range = "custom"
=============================================================================
