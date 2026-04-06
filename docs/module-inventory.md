# Module Inventory — Consolidation Plan

Created in v5 to track module consolidation from 69 → 45 target.

## Module Categories

### Core (Keep as-is — critical, well-used)
| Module | Lines | Used By | Status |
|---|---|---|---|
| db.ts | 300+ | Everything | Core |
| scanner.ts | 240+ | manifest-store | Core |
| manifest-store.ts | 200+ | All pages | Core |
| config.ts | 87 | Startup | Core |
| types.ts | 446 | Everything | Core |
| utils.ts | 44 | All components | Core |
| markdown.ts | 61 | Preview | Core |
| auth.ts | 87 | Middleware | Core |

### Intelligence (Keep — proven value)
| Module | Lines | Status |
|---|---|---|
| hygiene-analyzer.ts | 436 | Core feature |
| knowledge-graph.ts | 156 | Core feature |
| change-feed.ts | 248 | Core feature |
| decision-tracker.ts | 400+ | Core feature |
| embeddings.ts | 312 | Search |
| ai-client.ts | 374 | AI features |

### v5 Additions (Keep — recently built, actively used)
| Module | Lines | Status |
|---|---|---|
| search-cache.ts | 151 | v5 — search perf |
| mcp-cache.ts | 63 | v5 — MCP perf |
| notifications.ts | 226 | v5 — automation |
| digest-scheduler.ts | 161 | v5 — automation |
| deprecation.ts | 70 | v5 — cleanup |
| benchmarks.ts | 214 | v5 — perf |

### Candidates for Merge
| Candidate A | Candidate B | Merge Into | Reason |
|---|---|---|---|
| config-client.ts (23) | config.ts (87) | config.ts | Same domain |
| rate-limiter.ts (103) | validation.ts (144) | middleware-utils.ts | Both middleware |
| context-manager.ts (66) | preferences.ts (24) | user-context.ts | Both user state |
| search-cache.ts (151) | mcp-cache.ts (63) | cache.ts | Same LRU pattern |

### Candidates for Deprecation/Removal (v5.1)
| Module | Lines | Reason |
|---|---|---|
| federation.ts | 156 | 0 users — deprecated |
| sharing.ts | 157 | 0 adoption — deprecated |
| marketplace.ts | 136 | 0 community — deprecated |
| sso.ts | 456 | 0 enterprise users |
| multi-model.ts | 380 | Infrastructure only |
| plugin-registry.ts | 148 | 2 plugins, no growth |
| plugin-sandbox.ts | 170 | Unused without plugins |
| context-manager.ts | 66 | Multi-context unused |

### v4 Agent Modules (Keep code, archive from active use)
| Module | Lines | Status |
|---|---|---|
| agent-memory.ts | 229 | Archived — no adoption |
| session-tracker.ts | 284 | Archived — no adoption |
| change-pipeline.ts | 165 | Archived — never triggered |
| smart-summary.ts | 278 | Archived — never integrated |
| knowledge-gaps.ts | 200 | Archived — niche |
| context-compiler.ts | 214 | Keep — used by meeting-briefing |
| meeting-briefing.ts | 192 | Keep — calendar integration |
| weekly-digest.ts | 248 | Keep — scheduled automation |

## Summary

| Category | Count | Target |
|---|---|---|
| Core | 8 | Keep |
| Intelligence | 6 | Keep |
| v5 Additions | 6 | Keep |
| Merge Candidates | 8 → 4 | Merge |
| Deprecation Candidates | 8 | Remove in v5.1 |
| v4 Agent (archived) | 5 | Keep code, inactive |
| Other (active) | ~28 | Keep |
| **Total** | **69** | **~50** after merges + deprecation |

## Next Steps

1. ✅ Created inventory (this document)
2. Merge the 4 candidate pairs (separate PRs)
3. Remove deprecated modules in v5.1
4. Target: 69 → ~50 after merges, → ~42 after v5.1 removal
