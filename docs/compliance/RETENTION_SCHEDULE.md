# Retention schedule

**Status: Draft — requires legal review (H-23). Not legal advice.** Source: COMPLIANCE §2.6. Last updated 10 Nov 2026.

Removal is a scheduled job that deletes or anonymises row by row, except audit logs, which are removed a whole month at a time. The daily retention job is built in task P2-13; data kinds that arrive later are added to it by the task that creates them. Each period has a boundary test (one day before, one day after).

## 1. Periods set in the product rules

| Data | Kept for | Starts from | Removed by | Why this long |
|---|---|---|---|---|
| Sign-in link tokens | 24 hours | Creation | Retention job (P2-13) | Links are valid 15 minutes; a day covers investigation |
| Sessions | The role's session lifetime + 30 days | Expiry | Retention job | Lets a person see recent devices; security review |
| Inbox notifications | 12 months | Creation | Monthly partitions dropped | Reference for the customer |
| Rejected and expired points requests | 24 months | Decision | Retention job | Disputes and fraud patterns |
| Private feedback | 24 months | Creation; text is redacted at once on account deletion | Retention job | Lets a shop see trends; rating and date kept for averages |
| Game sessions and scores | 12 months | Creation | Retention job (added in P4-07) | Leaderboards are weekly; a year covers abuse review |
| Marketplace listings and seller contact number | 30 days after the listing ends | Expiry, sale or removal | Retention job (added in P4-01) | Appeals and reports after a listing ends |
| Number-reveal logs | 12 months | Reveal | Retention job (added in P4-03) | Safety investigations |
| Device signals | 90 days | Capture | Retention job | Fraud patterns are short-lived |
| Receipt photos | 12 months | Upload | Retention job | Refund and dispute window |
| Audit logs | 2 years | Month of the event | Whole monthly partition dropped | Accountability; security investigations |
| Application logs | 30 days | Written | Log rotation on the server | Fault finding |
| Backups (dumps, base backups, write-ahead logs) | 35 days | Creation | Storage lifecycle rule and wal-g retention | Recovery; this is why erasure completes in backups within 35 days |
| Shop invoices and payment records | 6 years | End of the financial year | Retention job | Accounting records |
| Inactive customer accounts | Reviewed at 24 months without activity | Last activity | Notice to the customer, then erasure; never automatic without notice | Data minimisation |
| Frozen progress after leaving a shop | 30 days | Leaving | Points expiry job (P1-13) | Lets a customer rejoin |
| Redemption codes | 15 minutes live | Creation | Voided on expiry | Single use |
| Points ledger | Not removed | — | — | Holds no personal data: membership IDs only. Erasure leaves it pseudonymous |

## 2. Gaps: data with no period in the product rules

These appear in the ROPA with a ⚠. We propose a period for each so the retention job has something to enforce. The solicitor confirms or changes them; COMPLIANCE §2.6 is then updated.

| # | Data | Proposed period | Reasoning |
|---|---|---|---|
| G1 | Approved points requests and receipt records (not the photo) | Life of the account, then anonymised with the profile; README question 7 asks whether shops need longer for their own accounts | The customer's purchase history is part of the service |
| G2 | Push subscriptions | Removed when the browser reports them gone, on sign-out, on account deletion, or after 12 months without use | They stop working on their own; no reason to keep dead ones |
| G3 | Offer claims, saved offers, private-offer responses | 24 months after the offer ends | Same as rejected requests: disputes and patterns |
| G4 | Birthday and win-back suggestion drafts | 90 days after they are sent or skipped | Only needed to stop a repeat in the same cycle |
| G5 | Reports, moderation decisions, strikes, appeals, review-rule flags | 24 months after the decision | Online Safety Act record-keeping; repeat-offender history |
| G6 | Fraud flags and their evidence | 24 months after the flag is closed | Repeat patterns; evidence for a reversal dispute |
| G7 | Analytics events | 13 months | Year-on-year comparison; already anonymised |
| G8 | Data export files | 7 days, then deleted from storage | The download link expires; the file is sensitive |
| G9 | Records of rights requests and data protection complaints | 3 years after closure | Evidence that deadlines were met |
| G10 | Rejected shop applications | 12 months | Duplicate and abuse checks |
| G11 | Incident and breach records | 6 years | Accountability to the regulator |

## 3. What erasure does to each kind

An account deletion does not wait for these periods. See [DSAR_AND_ERASURE.md](DSAR_AND_ERASURE.md) §5 for the full cascade. In short: the profile is anonymised at once, listings are removed, feedback text is redacted, live codes are voided, sessions and push subscriptions are revoked; the ledger and audit rows stay because they hold only IDs; backups age out within 35 days.

## 4. Suspended and closed shops

- A closed shop's page shows the closure notice and reward deadline for 30 days, then is archived.
- Member data for a closed shop follows the customer's account, not the shop.
- Shop invoices and payment records stay 6 years whatever the shop's state.
