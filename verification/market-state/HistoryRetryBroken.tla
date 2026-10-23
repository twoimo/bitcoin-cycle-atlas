----------------------------- MODULE HistoryRetryBroken -----------------------------
EXTENDS Naturals

\* One selected interval with existing validated candles and a missing viewport.
\* retryBlocked abstracts history.retryAt > Date.now(); time is not modeled.
\* refreshDone is a verification monitor, not additional product state.
VARIABLES active, status, historyStatus, retryBlocked, refreshDone
vars == <<active, status, historyStatus, retryBlocked, refreshDone>>

Init == /\ active = "none" /\ status = "snapshot"
        /\ historyStatus = "idle" /\ retryBlocked = FALSE /\ refreshDone = FALSE

\* Asking for an uncovered viewport starts one history stream.
RequestHistory ==
  /\ active = "none" \* dist/market-data-controller.js:87-90
  /\ ~retryBlocked \* dist/market-data-controller.js:89
  /\ active' = "history" /\ historyStatus' = "loading"
  /\ refreshDone' = FALSE
  /\ UNCHANGED <<status, retryBlocked>>

\* Final page success; individual candle values and page counts are abstracted.
HistorySuccess ==
  /\ active = "history" \* dist/market-data-controller.js:109-113
  /\ active' = "none" /\ historyStatus' = "ready" /\ retryBlocked' = FALSE
  /\ UNCHANGED <<status, refreshDone>>

HistoryFailure ==
  /\ active = "history" \* dist/market-data-controller.js:115-120
  /\ active' = "none" /\ historyStatus' = "error" /\ retryBlocked' = TRUE
  /\ UNCHANGED <<status, refreshDone>>

\* Baseline load(force:true) cancels the current stream and publishes loading,
\* but leaves its old cooldown intact. Retained candles remain available.
StartRefresh ==
  /\ active' = "refresh" /\ status' = "loading" /\ refreshDone' = FALSE
  /\ UNCHANGED retryBlocked \* baseline d906df3: dist/market-data-controller.js:38-42
  /\ UNCHANGED historyStatus

RefreshSuccess ==
  /\ active = "refresh" \* dist/market-data-controller.js:57-60
  /\ active' = "none" /\ status' = "ready" /\ historyStatus' = "idle"
  /\ retryBlocked' = FALSE /\ refreshDone' = TRUE

\* Because this model starts with existing candles, fallback uses prior.series
\* without awaiting another snapshot. The existing history object is retained.
RefreshFailure ==
  /\ active = "refresh" \* dist/market-data-controller.js:62-67
  /\ active' = "none" /\ status' = "snapshot" /\ historyStatus' = "idle"
  /\ refreshDone' = TRUE
  /\ UNCHANGED retryBlocked

\* Abstract environment step; no claim about the duration or monotonicity of time.
CooldownElapsed ==
  /\ retryBlocked \* dist/market-data-controller.js:89
  /\ retryBlocked' = FALSE
  /\ UNCHANGED <<active, status, historyStatus, refreshDone>>

System == HistorySuccess \/ HistoryFailure \/ RefreshSuccess \/ RefreshFailure \/ CooldownElapsed
Next == RequestHistory \/ StartRefresh \/ System
Spec == Init /\ [][Next]_vars

TypeOK == /\ active \in {"none", "history", "refresh"}
          /\ status \in {"snapshot", "ready", "loading"}
          /\ historyStatus \in {"idle", "loading", "ready", "error"}
          /\ retryBlocked \in BOOLEAN /\ refreshDone \in BOOLEAN

\* After manual refresh finishes, the prior failed history attempt cannot block
\* the requested visible window. A subsequent failed attempt may set a new delay.
RefreshCanRetry == refreshDone => ~retryBlocked
=============================================================================
