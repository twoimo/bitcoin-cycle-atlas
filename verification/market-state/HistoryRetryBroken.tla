----------------------------- MODULE HistoryRetryBroken -----------------------------
EXTENDS Naturals

\* Adapted from PR #12, rechecked against main 1b7c87ce on 2026-10-26.
\* One selected interval with existing validated candles and a missing viewport.
\* BTC and ETH use separate controller instances; product values are abstracted.
\* retryBlocked abstracts history.retryAt > Date.now(); time is not modeled.
\* refreshDone is a verification monitor, not additional product state.
VARIABLES active, status, historyStatus, retryBlocked, refreshDone
vars == <<active, status, historyStatus, retryBlocked, refreshDone>>

Init == /\ active = "none" /\ status = "snapshot"
        /\ historyStatus = "idle" /\ retryBlocked = FALSE /\ refreshDone = FALSE

\* Asking for an uncovered viewport starts one history stream.
RequestHistory ==
  /\ active = "none" \* dist/market-data-controller.js:86-90
  /\ ~retryBlocked \* dist/market-data-controller.js:88
  /\ active' = "history" /\ historyStatus' = "loading"
  /\ refreshDone' = FALSE
  /\ UNCHANGED <<status, retryBlocked>>

\* Final page success; individual candle values and page counts are abstracted.
HistorySuccess ==
  /\ active = "history" \* dist/market-data-controller.js:108-112
  /\ active' = "none" /\ historyStatus' = "ready" /\ retryBlocked' = FALSE
  /\ UNCHANGED <<status, refreshDone>>

HistoryFailure ==
  /\ active = "history" \* dist/market-data-controller.js:114-119
  /\ active' = "none" /\ historyStatus' = "error" /\ retryBlocked' = TRUE
  /\ UNCHANGED <<status, refreshDone>>

\* Baseline load(force:true) cancels the current stream and publishes loading,
\* but leaves its old cooldown intact. Retained candles remain available.
StartRefresh ==
  /\ active' = "refresh" /\ status' = "loading" /\ refreshDone' = FALSE
  /\ UNCHANGED retryBlocked \* baseline 1b7c87ce: dist/market-data-controller.js:38-47
  /\ UNCHANGED historyStatus

RefreshSuccess ==
  /\ active = "refresh" \* dist/market-data-controller.js:56-59
  /\ active' = "none" /\ status' = "ready" /\ historyStatus' = "idle"
  /\ retryBlocked' = FALSE /\ refreshDone' = TRUE

\* Because this model starts with existing candles, fallback uses prior.series
\* without awaiting another snapshot. The existing history object is retained.
RefreshFailure ==
  /\ active = "refresh" \* dist/market-data-controller.js:61-66
  /\ active' = "none" /\ status' = "snapshot" /\ historyStatus' = "idle"
  /\ refreshDone' = TRUE
  /\ UNCHANGED retryBlocked

\* Abstract environment step; no claim about the duration or monotonicity of time.
CooldownElapsed ==
  /\ retryBlocked \* dist/market-data-controller.js:88
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
