# Data protection drafts — Moz Rewards

**Status: Draft — requires legal review (HUMAN_TASKS H-23). Not legal advice.**
Written by the development team on 10 Nov 2026 from the product, architecture and security specifications. Nothing here has been checked by a solicitor yet. The code follows these defaults until the solicitor confirms or changes them (COMPLIANCE §2).

## What is in this folder

| File | What it is | Law it answers |
|---|---|---|
| [ROPA.md](ROPA.md) | Record of processing activities: every purpose, its lawful basis, who the controller is, who receives the data and how long it is kept | UK GDPR Art. 30 |
| [CONTROLLER_ROLES.md](CONTROLLER_ROLES.md) | Who decides what: the platform and each shop as separate controllers, and the data-sharing terms for the Shop Terms | UK GDPR Art. 4(7), 24, 26 |
| [PROCESSOR_REGISTER.md](PROCESSOR_REGISTER.md) | Every outside company that touches data, what it gets, where it is, and the transfer basis | UK GDPR Art. 28, 30, 44–46 |
| [DPIA.md](DPIA.md) | Data protection impact assessment: risks to people, what reduces them, and the task that builds each safeguard | UK GDPR Art. 35; ICO Children's code |
| [RETENTION_SCHEDULE.md](RETENTION_SCHEDULE.md) | How long each kind of data is kept and what removes it | UK GDPR Art. 5(1)(e) |
| [DSAR_AND_ERASURE.md](DSAR_AND_ERASURE.md) | What a person gets when they ask for their data, and what is removed when they delete their account | UK GDPR Art. 12, 15, 17, 20 |
| [COMPLAINTS_PROCESS.md](COMPLAINTS_PROCESS.md) | How a data protection complaint is received, acknowledged and answered | Data (Use and Access) Act 2025 |

## The product in one paragraph

Moz Rewards is a loyalty app for UK shops, cafés, restaurants and hotels. A customer scans a code in a shop, joins that shop's programme, asks for points after a purchase, and a member of staff approves them. Customers can also rate a visit, browse offers, play a free game and use a simple marketplace (listings only: no chat, no payments). Shops use a dashboard; the platform team uses an admin panel. Customers must be 13 or over.

## Questions for the solicitor

These are the points where we chose a default and need a decision. Each links to the place it matters.

1. **Controller roles.** We treat the platform and each shop as independent controllers, not joint controllers and not controller–processor ([CONTROLLER_ROLES.md](CONTROLLER_ROLES.md) §3). Is that right for the loyalty data the platform stores on a shop's behalf?
2. **Analytics basis.** The product rules say legitimate interests with an opt-out; the code as built loads analytics only after the visitor agrees ([ROPA.md](ROPA.md) row 24). Keep the stricter version, or move to opt-out under the amended PECR statistics exemption?
3. **Fraud prevention basis.** Legitimate interests with the balancing test in [DPIA.md](DPIA.md) §6, or the new "recognised legitimate interest" for crime prevention?
4. **Device signals and PECR.** Do the fraud-only device signals fall within the "strictly necessary" exemption as amended ([DPIA.md](DPIA.md) §7)?
5. **Children.** Customers may be 13–17 and we usually do not know which. What should marketing opt-in, shop segments and streaks look like for someone who has not confirmed they are 18 or over ([DPIA.md](DPIA.md) §5, risk C3)?
6. **Retention gaps.** Eleven kinds of data have no period in the product rules; we propose one for each ([RETENTION_SCHEDULE.md](RETENTION_SCHEDULE.md) §2).
7. **Receipts and tax.** Do shops need the purchase records for their own accounting, and for how long?
8. **Fraud flags in a data request.** When may a fraud flag be withheld from the person it is about ([DSAR_AND_ERASURE.md](DSAR_AND_ERASURE.md) §3)?
9. **Transfers.** Confirm the transfer basis for each United States provider from its signed agreement ([PROCESSOR_REGISTER.md](PROCESSOR_REGISTER.md)).
10. **Registration and officer.** The client must pay the ICO data protection fee before launch. Is a data protection officer required, given regular monitoring of customers' visits across many shops?

## What the client must do (not the developers)

- Sign a data processing agreement with every processor in the register and record the date there.
- Pay the ICO data protection fee and note the registration number in the ROPA header.
- Name the person who handles data requests and complaints.
- Complete the Online Safety Act assessments for the marketplace (templates arrive in Phase 4).

## Keeping these current

A task that adds a new kind of personal data, a new purpose or a new outside provider updates the ROPA, the retention schedule and the processor register in the same commit. No processor goes live without a register row (COMPLIANCE §2.3). The DPIA is updated when a feature changes the risk, and reviewed again in the Phase 5 compliance audit (P5-06).
