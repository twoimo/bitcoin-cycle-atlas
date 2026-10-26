---- MODULE Publication_rules ----
EXTENDS Publication
StatechartTLC == INSTANCE TLC
StatechartBroken == (IF TypeOK THEN {} ELSE {"TypeOK"}) \cup (IF PreparedRevisionMatches THEN {} ELSE {"PreparedRevisionMatches"}) \cup (IF PreparedContentMatches THEN {} ELSE {"PreparedContentMatches"}) \cup (IF ConfirmedIdentityMatches THEN {} ELSE {"ConfirmedIdentityMatches"})
StatechartRules == StatechartBroken = {} \/ StatechartTLC!PrintT(<<"statechart broken", [phase |-> phase, currentCommit |-> currentCommit, currentDigest |-> currentDigest, validatedDigest |-> validatedDigest, preparedCommit |-> preparedCommit, preparedDigest |-> preparedDigest, servedCommit |-> servedCommit, servedDigest |-> servedDigest], StatechartBroken>>)
====
