# Supabase — IQ CINEMA (project `xpmrodzzrizacvdmkrmj`, eu-west-1)

Pulled from the live project.

- `functions/` — all 5 edge functions (`check-milestones`, `paystack-webhook`, `paystack-initialize`, `process-withdrawal`, `transcode-episode`) + `_shared/cors.ts`. JWT verification: on for all except `paystack-webhook` (it verifies Paystack's HMAC signature instead).
- `migrations/` — the 26 timestamped migrations, exactly as applied.
- `schema_snapshot.sql` — reconstructed baseline standing in for migrations 0001–0005 (their SQL isn't stored server-side). Reference only; don't run on top of `migrations/`.
- Secrets (`PAYSTACK_SECRET_KEY`, etc.) and the Vault key `edge_fn_anon_key` are not included — set them on any new project.
