---
phase: 2
slug: dependency-analysis
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-03
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.x |
| **Config file** | none — uses package.json defaults |
| **Quick run command** | `pnpm vitest run src/prd/dependency-analyzer.test.ts` |
| **Full suite command** | `pnpm vitest run src/` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run src/prd/dependency-analyzer.test.ts`
- **After every plan wave:** Run `pnpm vitest run src/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | PLAN-01 | unit | `pnpm vitest run src/prd/dependency-analyzer.test.ts` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 1 | PLAN-01 | unit | `pnpm vitest run src/prd/dependency-analyzer.test.ts` | ❌ W0 | ⬜ pending |
| 2-01-03 | 01 | 1 | PLAN-01 | unit | `pnpm vitest run src/prd/dependency-analyzer.test.ts` | ❌ W0 | ⬜ pending |
| 2-01-04 | 01 | 1 | PLAN-01 | unit | `pnpm vitest run src/prd/dependency-analyzer.test.ts` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02 | 1 | PLAN-02 | unit | `pnpm vitest run src/prd/dependency-analyzer.test.ts` | ❌ W0 | ⬜ pending |
| 2-02-02 | 02 | 1 | PLAN-02 | unit | `pnpm vitest run src/prd/dependency-analyzer.test.ts` | ❌ W0 | ⬜ pending |
| 2-02-03 | 02 | 1 | PLAN-02 | unit | `pnpm vitest run src/prd/dependency-analyzer.test.ts` | ❌ W0 | ⬜ pending |
| 2-02-04 | 02 | 1 | PLAN-02 | unit | `pnpm vitest run src/prd/dependency-analyzer.test.ts` | ❌ W0 | ⬜ pending |
| 2-INT-01 | 01 | 2 | PLAN-01 | manual-only | N/A — requires workspace lifecycle | manual | ⬜ pending |
| 2-INT-02 | 01 | 2 | PLAN-01 | manual-only | N/A — requires workspace lifecycle | manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/prd/dependency-analyzer.ts` — new module; no file yet
- [ ] `src/prd/dependency-analyzer.test.ts` — covers PLAN-01 and PLAN-02
- [ ] Optional: add `phaseGroup?: number` field to `ParsedStory` in `parser.ts` and update `parser.test.ts`

*Existing test infrastructure covers all other test setup — no new framework installation needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `startWorkspace` prints report and exits cleanly on cycle-free PRD | PLAN-01 | Requires full workspace lifecycle | Run `william new` with a multi-story PRD, verify report prints before agents |
| `startWorkspace` exits with error on circular PRD | PLAN-01 | Requires full workspace lifecycle | Run `william new` with a PRD containing circular deps, verify error and halt |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
