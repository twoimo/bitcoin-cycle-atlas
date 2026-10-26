----------------------------- MODULE MarketRequestsBroken -----------------------------
EXTENDS Naturals, FiniteSets

CONSTANT RequestLimit
Intervals == {"one", "five"}
Ids == 1..RequestLimit
VARIABLES active, issued, selected, interval, phase, cancelled, status, storedStatus, displayed
vars == <<active, issued, selected, interval, phase, cancelled, status, storedStatus, displayed>>

Init == /\ active = 0 /\ issued = 0 /\ selected = "one"
        /\ interval = [id \in Ids |-> "one"]
        /\ phase = [id \in Ids |-> "unused"]
        /\ cancelled = {}
        /\ status = [i \in Intervals |-> "idle"]
        /\ displayed = [i \in Intervals |-> 0]
        /\ storedStatus = [i \in Intervals |-> "idle"]

\* load(..., {force:true}) calls cancel() then installs the new request.
\* A load on another interval has the same ownership transition.
Load(i) ==
  /\ issued < RequestLimit \* Finite bound on load generations; dist/market-data-controller.js:38-53
  /\ active' = issued + 1 /\ issued' = issued + 1 /\ selected' = i
  /\ interval' = [interval EXCEPT ![issued + 1] = i]
  /\ phase' = [phase EXCEPT ![issued + 1] = "live"]
  /\ cancelled' = IF active = 0 THEN cancelled ELSE cancelled \cup {active}
  /\ status' = [j \in Intervals |->
       IF j = i THEN "loading"
       ELSE IF active # 0 /\ j = interval[active] THEN
         storedStatus[j]
       ELSE status[j]]
  /\ UNCHANGED <<displayed, storedStatus>>

\* cancel() synchronously revokes ownership; responses may still arrive later.
Cancel ==
  /\ active # 0 \* dist/market-data-controller.js:29
  /\ cancelled' = cancelled \cup {active}
  /\ status' = [status EXCEPT ![interval[active]] =
       storedStatus[interval[active]]]
  /\ active' = 0
  /\ UNCHANGED <<issued, selected, interval, phase, displayed, storedStatus>>

\* Each completion is the synchronous continuation after its await.
LiveSuccess(id) ==
  /\ phase[id] = "live" \* dist/market-data-controller.js:62-67
  /\ phase' = [phase EXCEPT ![id] = "done"]
  /\ displayed' = IF active = id THEN [displayed EXCEPT ![interval[id]] = id] ELSE displayed
  /\ status' = IF active = id THEN [status EXCEPT ![interval[id]] = "ready"] ELSE status
  /\ storedStatus' = IF active = id THEN [storedStatus EXCEPT ![interval[id]] = "ready"] ELSE storedStatus
  /\ active' = IF active = id THEN 0 ELSE active
  /\ UNCHANGED <<issued, selected, interval, cancelled>>

LiveFailure(id) ==
  /\ phase[id] = "live" \* dist/market-data-controller.js:62-67
  /\ phase' = [phase EXCEPT ![id] = IF active = id THEN "fallback" ELSE "done"]
  /\ UNCHANGED <<active, issued, selected, interval, cancelled, status, storedStatus, displayed>>

\* Deliberate mutation of dist/market-data-controller.js:70: remove ownership guard.
SavedSuccess(id) ==
  /\ phase[id] = "fallback" \* dist/market-data-controller.js:69-74
  /\ phase' = [phase EXCEPT ![id] = "done"]
  /\ displayed' = [displayed EXCEPT ![interval[id]] = id]
  /\ status' = [status EXCEPT ![interval[id]] = "snapshot"]
  /\ storedStatus' = [storedStatus EXCEPT ![interval[id]] = "snapshot"]
  /\ active' = IF active = id THEN 0 ELSE active
  /\ UNCHANGED <<issued, selected, interval, cancelled>>

SavedFailure(id) ==
  /\ phase[id] = "fallback" \* dist/market-data-controller.js:69-74
  /\ displayed[interval[id]] = 0 \* dist/market-data-controller.js:69; prior.series would avoid the failing snapshot
  /\ phase' = [phase EXCEPT ![id] = "done"]
  /\ status' = IF active = id THEN [status EXCEPT ![interval[id]] = "error"] ELSE status
  /\ active' = IF active = id THEN 0 ELSE active
  /\ UNCHANGED <<issued, selected, interval, cancelled, displayed, storedStatus>>

System == \E id \in Ids: LiveSuccess(id) \/ LiveFailure(id) \/ SavedSuccess(id) \/ SavedFailure(id)
Next == (\E i \in Intervals: Load(i)) \/ Cancel \/ System
Spec == Init /\ [][Next]_vars

\* A canceled or replaced request must never supply a displayed chart.
NoStaleDisplay == \A i \in Intervals: displayed[i] \notin cancelled

=================================================================================
