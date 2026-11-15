# Temporary choices — what we did for now, and what production needs

_Human's standing rule (14 Nov 2026), CLAUDE.md §3 "Temporary choices are tracked". Every stopgap that production must not keep — a provider swapped, a security control replaced by a weaker equivalent, a setting relaxed "for now" — gets a line here in the same commit, with a DECISIONS entry and a CARRIED row to the task that resolves it. A line is closed only with evidence (move it to "Resolved" with the date and proof). **P5-14 (release candidate) can't be ticked while an open line remains**, and every `/phase-complete` lists the open lines in its reply._

## Open

| ID | Since | What we did for now | Why | What production needs (the real fix) | Must be done by | Tracked in |
|---|---|---|---|---|---|---|
| T-1 | 13 Nov 2026 | Backups go to **Backblaze B2** instead of Cloudflare R2 | R2 couldn't be enabled on the Cloudflare account | Move backups to R2, **or** keep B2 and add Backblaze to the processor register / ROPA with a DPA + UK addendum, reviewed by the solicitor; COMPLIANCE processor table updated; total retention ≤ 35 d | Before any real customer data is backed up (launch) | C-41, H-23, DECISIONS 13 Nov "Backups go to Backblaze B2 for now" |
| T-2 | 14 Nov 2026 | GitHub repo **public** | Unlimited Actions minutes during the build | Repo back to **private**; Actions minutes planned for a private repo (GitHub Pro or trimmed CI); on GitHub Free a private repo has no branch protection (ENGINEERING §16 "free" mode) | Before launch | C-43, DECISIONS 14 Nov "Repository is public until launch" |
| T-3 | 13 Nov 2026 | The backup **private key** is still in the Windows laptop's GnuPG keyring (safety net) | Kept until a restore from the password-manager copy is proven | After the first decrypt-and-restore from the password-manager copy passes: `gpg --delete-secret-keys 1D1D1BF1F6FDA0F2EDA8FAA0D356B5CAA21C0F58` on the Windows laptop | P0-15 D4 (first staging restore) | FOLLOWUPS [P0-15], H-26 |
| T-4 | 13 Nov 2026 | unattended-upgrades may **reboot the host at 04:30** when an update needs it (all containers restart) | Acceptable while there are no customers | Decide the production reboot window / no-reboot policy and document it in the RUNBOOK | P5-12 | DECISIONS 13 Nov "VPS hardening and the root deploy helper" |
| T-5 | 14 Nov 2026 | **Origin lock without Cloudflare Tunnel** on staging: proxied DNS + ufw opens 443 only to Cloudflare's IP ranges + Authenticated Origin Pulls (Cloudflare's shared client certificate) + Origin certificate with Full (strict). Umami's dashboard (production) can't sit behind Cloudflare Access either | Cloudflare Zero Trust (Tunnel, Access) needs a card on file; human chose not to add one for now | Before launch: set up Zero Trust (Free plan, card on file) and move staging + production to the Tunnel as SECURITY §11 says, Umami dashboard behind Access (or not exposed at all, reached over SSH). If the human instead accepts the proxy design for production: zone-level origin-pull certificate (not the shared one), DECISIONS + SECURITY §11 updated | P5-12 (production infrastructure) | C-44, H-40, DECISIONS 14 Nov "Origin lock without the Tunnel until launch" |

## Resolved

| ID | What | Resolved on | Proof |
|---|---|---|---|
