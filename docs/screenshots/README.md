# Synthetic demo output

No real screenshots or participant recordings are included. The following is actual output from the synthetic demo, executed with `node --import tsx demo/run.ts` because this sandbox denies the IPC socket used by `npm run demo`.

```text
Job: pending
Event: Job queued.
Job: active
Event: Job status changed to active.
Event: Output validation failed: question: String must contain at least 1 character(s)
Event: Job completed successfully.
Job: completed
Proposal: Tell me about a project you built with a team.
Repair retry: validation errors included in the second prompt
Session pack: synthetic-pack-01, 30 minutes, 5 phases
Synthetic participant: I built a prototype with my team and tested it with users. (fake audio: 4 bytes)
Report extracted and scored: 60 XP
Preview: partial_clear, timing missing: false
Identical pending report replay: idempotent=true
Before human confirmation: 0 XP
Confirmed report replay: rejected; XP unchanged
Human confirmation race: 1 accepted, 1 rejected
XP after confirmation: 60; replay awarded no additional XP
```
