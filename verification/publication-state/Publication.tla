---------------------------- MODULE Publication ----------------------------
EXTENDS Naturals
CONSTANTS DropRevisionGuard, DropDigestGuard, DropServedGuard
VARIABLES phase, currentCommit, currentDigest, validatedDigest,
          preparedCommit, preparedDigest, servedCommit, servedDigest
vars == <<phase, currentCommit, currentDigest, validatedDigest,
          preparedCommit, preparedDigest, servedCommit, servedDigest>>

Init == /\ phase = "collected"
        /\ currentCommit = 0 /\ currentDigest = 0
        /\ validatedDigest = 2 /\ preparedCommit = 2 /\ preparedDigest = 2
        /\ servedCommit = 2 /\ servedDigest = 2

ChangeSource == /\ phase \in {"collected", "verified"}
                /\ currentCommit = 0
                /\ currentCommit' = 1
                /\ UNCHANGED <<phase,currentDigest,validatedDigest,preparedCommit,preparedDigest,servedCommit,servedDigest>>
ChangeFiles == /\ phase \in {"collected", "verified"}
               /\ currentDigest = 0
               /\ currentDigest' = 1
               /\ UNCHANGED <<phase,currentCommit,validatedDigest,preparedCommit,preparedDigest,servedCommit,servedDigest>>

Validate == /\ phase = "collected" \* dist/publication-contract.js:11
            /\ phase' = IF currentDigest = 0 THEN "verified" ELSE "held" \* dist/publication-contract.js:13
            /\ validatedDigest' = IF currentDigest = 0 THEN 0 ELSE 2
            /\ UNCHANGED <<currentCommit,currentDigest,preparedCommit,preparedDigest,servedCommit,servedDigest>>
Reject == /\ phase = "collected" \* dist/publication-contract.js:11
          /\ phase' = "held" \* dist/publication-contract.js:13
          /\ UNCHANGED <<currentCommit,currentDigest,validatedDigest,preparedCommit,preparedDigest,servedCommit,servedDigest>>

Prepare == /\ phase = "verified" \* dist/publication-contract.js:17
           /\ phase' = IF ~DropRevisionGuard /\ currentCommit # 0 THEN "superseded" \* dist/publication-contract.js:19
                        ELSE IF ~DropDigestGuard /\ (currentDigest # 0 \/ validatedDigest # 0) THEN "held" \* dist/publication-contract.js:20
                        ELSE "ready"
           /\ preparedCommit' = currentCommit
           /\ preparedDigest' = currentDigest
           /\ UNCHANGED <<currentCommit,currentDigest,validatedDigest,servedCommit,servedDigest>>

Confirm(c,d) == /\ phase = "ready" \* dist/publication-contract.js:24
                /\ phase' = IF ~DropServedGuard /\ (c # 0 \/ d # 0) THEN "held" ELSE "confirmed" \* dist/publication-contract.js:26
                /\ servedCommit' = c /\ servedDigest' = d
                /\ UNCHANGED <<currentCommit,currentDigest,validatedDigest,preparedCommit,preparedDigest>>
Next == ChangeSource \/ ChangeFiles \/ Validate \/ Reject \/ Prepare \/ (\E c,d \in 0..1: Confirm(c,d))
Spec == Init /\ [][Next]_vars
TypeOK == /\ phase \in {"collected","verified","held","superseded","ready","confirmed"}
          /\ currentCommit \in 0..1 /\ currentDigest \in 0..1
          /\ validatedDigest \in 0..2 /\ preparedCommit \in 0..2 /\ preparedDigest \in 0..2
          /\ servedCommit \in 0..2 /\ servedDigest \in 0..2
PreparedRevisionMatches == phase \in {"ready","confirmed"} => preparedCommit = 0
PreparedContentMatches == phase \in {"ready","confirmed"} => preparedDigest = 0 /\ validatedDigest = 0
ConfirmedIdentityMatches == phase = "confirmed" => servedCommit = 0 /\ servedDigest = 0
=============================================================================
