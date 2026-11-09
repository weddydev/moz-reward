#!/bin/sh
# Runs on EVERY push (see lefthook.yml): git's push lines arrive on stdin and scripts/pre-push.ts decides.
exec pnpm exec tsx scripts/pre-push.ts
