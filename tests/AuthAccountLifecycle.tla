---- MODULE AuthAccountLifecycle ----
\* Local account lifetime for dist/auth-account.js.
\* A is the bootstrap admin. B is the invited account. C is the replacement
\* admin after no admin, pending account, or active member remains.
\* Deleting the last admin promotes an active member, or the pending account
\* when no active member remains.
\* Status: 0 absent, 1 pending, 2 member, 3 admin, 4 rejected, 5 deleted.
\* Password verification and the following write are one critical section
\* (commitSync after every await). Broken = TRUE keeps the old split write:
\* a login that started before deletion puts its stale snapshot back.
EXTENDS Integers

CONSTANTS Broken

VARIABLES a, b, c, session, token, aTok, bTok, inflight, snapA, aBuried

vars == <<a, b, c, session, token, aTok, bTok, inflight, snapA, aBuried>>

Init ==
  /\ a = 0 /\ b = 0 /\ c = 0 /\ session = 0 /\ token = 0
  /\ aTok = 0 /\ bTok = 0
  /\ inflight = FALSE /\ snapA = 0 /\ aBuried = FALSE

SignupA ==
  /\ ~inflight /\ a = 0 /\ b = 0 /\ c = 0 /\ session = 0 /\ ~aBuried
  /\ a' = 3 /\ session' = 1 /\ aTok' = 1 /\ token' = 1
  /\ UNCHANGED <<b, c, bTok, inflight, snapA, aBuried>>

SignupB ==
  /\ ~inflight /\ session = 0 /\ b = 0 /\ a = 3 /\ c = 0 /\ ~aBuried
  /\ b' = 1 /\ session' = 2 /\ bTok' = 1 /\ token' = 1 /\ aTok' = 0
  /\ UNCHANGED <<a, c, inflight, snapA, aBuried>>

\* The code opens a new admin account when no admin, pending account, or member remains.
Bootstrap ==
  /\ ~inflight /\ session = 0 /\ c = 0
  /\ a # 3 /\ b # 1 /\ b # 2 /\ b # 3
  /\ ~(a = 0 /\ b = 0)
  /\ c' = 3 /\ session' = 3 /\ token' = 1
  /\ UNCHANGED <<a, b, aTok, bTok, inflight, snapA, aBuried>>

Logout ==
  /\ ~inflight /\ session # 0
  /\ session' = 0 /\ token' = 0
  /\ aTok' = IF session = 1 THEN 0 ELSE aTok
  /\ bTok' = IF session = 2 THEN 0 ELSE bTok
  /\ UNCHANGED <<a, b, c, inflight, snapA, aBuried>>

LoginRead ==
  /\ ~inflight /\ a = 3 /\ ~aBuried
  /\ inflight' = TRUE /\ snapA' = a
  /\ UNCHANGED <<a, b, c, session, token, aTok, bTok, aBuried>>

\* Fixed login re-reads. A deletion that landed during the password check stays.
CommitGood ==
  /\ ~Broken /\ inflight
  /\ inflight' = FALSE /\ snapA' = 0
  /\ IF a = 3 /\ ~aBuried
     THEN /\ session' = 1
          /\ aTok' = IF aTok < 2 THEN aTok + 1 ELSE 2
          /\ token' = aTok'
          /\ UNCHANGED <<a, b, c, bTok, aBuried>>
     ELSE UNCHANGED <<a, b, c, session, token, aTok, bTok, aBuried>>

\* Old login writes the snapshot it took before the overlapping deletion.
CommitBad ==
  /\ Broken /\ inflight /\ snapA = 3
  /\ a' = snapA /\ inflight' = FALSE /\ snapA' = 0
  /\ session' = 1 /\ aTok' = 1 /\ token' = 1
  /\ UNCHANGED <<b, c, bTok, aBuried>>

Commit == IF Broken THEN CommitBad ELSE CommitGood

DeleteA ==
  /\ session = 1 /\ token = aTok /\ aTok > 0 /\ a = 3 /\ ~aBuried
  /\ a' = 5 /\ aBuried' = TRUE
  /\ session' = 0 /\ token' = 0 /\ aTok' = 0
  /\ b' = IF b \in {1, 2} THEN 3 ELSE b
  /\ UNCHANGED <<c, bTok, inflight, snapA>>

DeleteB ==
  /\ ~inflight /\ session = 2 /\ token = bTok /\ bTok > 0 /\ b \in {1, 2, 3}
  /\ b' = 5 /\ session' = 0 /\ token' = 0 /\ bTok' = 0
  /\ a' = IF b = 3 /\ a \in {1, 2} THEN 3 ELSE a
  /\ UNCHANGED <<c, aTok, inflight, snapA, aBuried>>

ApproveB ==
  /\ ~inflight /\ session = 1 /\ token = aTok /\ a = 3 /\ ~aBuried /\ b = 1
  /\ b' = 2
  /\ UNCHANGED <<a, c, session, token, aTok, bTok, inflight, snapA, aBuried>>

RejectB ==
  /\ ~inflight /\ session = 1 /\ token = aTok /\ a = 3 /\ ~aBuried /\ b = 1
  /\ b' = 4 /\ bTok' = 0
  /\ UNCHANGED <<a, c, session, token, aTok, inflight, snapA, aBuried>>

ChangeA ==
  /\ ~inflight /\ session = 1 /\ token = aTok /\ a = 3 /\ ~aBuried /\ aTok < 2
  /\ aTok' = aTok + 1 /\ token' = aTok'
  /\ UNCHANGED <<a, b, c, bTok, session, inflight, snapA, aBuried>>

LoginB ==
  /\ ~inflight /\ b \in {1, 2, 3}
  /\ session' = 2
  /\ bTok' = IF bTok < 2 THEN bTok + 1 ELSE 2
  /\ token' = bTok'
  /\ aTok' = 0
  /\ UNCHANGED <<a, b, c, inflight, snapA, aBuried>>

LoginC ==
  /\ ~inflight /\ c = 3 /\ session # 3
  /\ session' = 3 /\ token' = 1 /\ aTok' = 0
  /\ bTok' = IF session = 2 THEN 0 ELSE bTok
  /\ UNCHANGED <<a, b, c, inflight, snapA, aBuried>>

\* Admin creates B as an active member. B has no session until LoginB.
AdminCreateB ==
  /\ ~inflight /\ session = 1 /\ token = aTok /\ aTok > 0 /\ a = 3 /\ ~aBuried /\ b = 0
  /\ b' = 2
  /\ UNCHANGED <<a, c, session, token, aTok, bTok, inflight, snapA, aBuried>>

\* Admin removes B. A's session stays. B's token cannot be reused.
AdminDeleteB ==
  /\ ~inflight /\ session = 1 /\ token = aTok /\ aTok > 0 /\ a = 3 /\ ~aBuried /\ b \in {1, 2, 3}
  /\ b' = 5 /\ bTok' = 0
  /\ UNCHANGED <<a, c, session, token, aTok, inflight, snapA, aBuried>>

\* Demotion is allowed only while another admin remains.
AdminDemoteB ==
  /\ ~inflight /\ session = 1 /\ token = aTok /\ a = 3 /\ b = 3 /\ ~aBuried
  /\ b' = 2
  /\ UNCHANGED <<a, c, session, token, aTok, bTok, inflight, snapA, aBuried>>

AdminPromoteB ==
  /\ ~inflight /\ session = 1 /\ token = aTok /\ aTok > 0 /\ a = 3 /\ b = 2 /\ ~aBuried
  /\ b' = 3
  /\ UNCHANGED <<a, c, session, token, aTok, bTok, inflight, snapA, aBuried>>

AdminDemoteA ==
  /\ ~inflight /\ session = 1 /\ token = aTok /\ a = 3 /\ b = 3 /\ ~aBuried
  /\ a' = 2
  /\ UNCHANGED <<b, c, session, token, aTok, bTok, inflight, snapA, aBuried>>

Next ==
  \/ SignupA \/ SignupB \/ Bootstrap \/ Logout \/ LoginRead \/ Commit
  \/ DeleteA \/ DeleteB \/ ApproveB \/ RejectB \/ ChangeA \/ LoginB \/ LoginC
  \/ AdminCreateB \/ AdminDeleteB \/ AdminPromoteB \/ AdminDemoteB \/ AdminDemoteA

Spec == Init /\ [][Next]_vars

SessionMatches ==
  \/ session = 0
  \/ (session = 1 /\ token = aTok /\ aTok > 0 /\ a \in {2, 3} /\ ~aBuried)
  \/ (session = 2 /\ token = bTok /\ bTok > 0 /\ b \in {1, 2, 3})
  \/ (session = 3 /\ c = 3 /\ token = 1)

DeletionStays == aBuried => (a = 5 /\ session # 1 /\ aTok = 0)

MemberHasAdmin == b = 2 => (a = 3 \/ b = 3 \/ c = 3)

ActorMemberHasAdmin == a = 2 => (b = 3 \/ c = 3)

PendingHasAdmin == b = 1 => (a = 3 \/ c = 3)

RejectedSilent == b = 4 => (session # 2 /\ bTok = 0)

====
