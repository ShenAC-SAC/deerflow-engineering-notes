# DeerFlow 3.0 Design Notes: Persistence Runtime Boundaries

This note records design observations from reading the current DeerFlow persistence and Gateway runtime code.

## Current Shape

DeerFlow has several persistence surfaces:

```text
LangGraph checkpointer
  graph state and checkpoint history.

LangGraph store
  long-term KV state exposed through Runtime.store.

RunStore
  run lifecycle rows and token summaries.

RunEventStore
  message / trace / lifecycle events.

ThreadMetaStore
  thread list, owner, title, status, metadata.
```

This separation is reasonable. These surfaces have different query patterns and different recovery semantics. The main 3.0 opportunity is to make the boundaries first-class and configured through one runtime profile.

Application-table schema bootstrap is no longer an open design debt. `persistence.bootstrap.bootstrap_schema()` handles empty DBs, legacy pre-Alembic DBs, and already-versioned DBs with a hybrid `create_all` + Alembic stamp/upgrade strategy. The observations below therefore focus on runtime configuration and recovery semantics, not on missing schema migration machinery.

## Design Observation 1: `database` And `checkpointer` Are Not Fully Unified

The new `database` section intends to configure both checkpointer and application persistence.

Current async Gateway path:

```text
make_checkpointer(config)
  reads legacy checkpointer first
  then reads database

init_engine_from_config(config.database)
  initializes SQLAlchemy app persistence

make_store(config)
  reads only legacy checkpointer
  does not read database
```

Therefore a valid-looking configuration can produce mixed persistence:

```text
database.backend = sqlite
checkpointer omitted

checkpointer  -> SQLite from database
run_store     -> SQL from database
thread_meta   -> SQL from database
store         -> InMemoryStore
```

For 3.0, introduce one `PersistenceProfile` resolved at startup:

```ts
interface PersistenceProfile {
  backend: "memory" | "sqlite" | "postgres";
  checkpointer: CheckpointerSpec;
  store: StoreSpec;
  runStore: RunStoreSpec;
  runEventStore: RunEventStoreSpec;
  threadMetaStore: ThreadMetaStoreSpec;
}
```

All factories should consume the same resolved profile, not re-derive their backend independently.

## Design Observation 2: Startup Validation Should Reject Impossible Combinations

Current behavior can silently fall back:

```text
run_events.backend = db
database.backend = memory
  -> MemoryRunEventStore fallback
```

Fallbacks are convenient during development, but production operators need explicit feedback.

For 3.0, validate persistence combinations at startup:

```text
run_events.backend=db requires database.backend != memory
store backend must match checkpointer backend unless explicitly overridden
jsonl run events are single-process only
postgres multi-worker requires worker ownership / lease semantics
```

The validation output should be operational, not abstract:

```text
Invalid persistence config:
  run_events.backend=db requires database.backend=sqlite or postgres.
  Current database.backend=memory would lose run messages after restart.
```

## Design Observation 3: Recovery Contract Should Be Written Per Surface

Users often hear "persistence" and assume every runtime detail survives restart. DeerFlow does not and should not promise that.

For 3.0, document and expose a recovery contract:

```text
checkpoint survives?
message history survives?
run list survives?
thread list survives?
active run can continue?
active run can be cancelled after restart?
SSE stream can be rejoined after restart?
```

Expected answers may look like:

```text
checkpoint survives if checkpointer is persistent
message history survives if run_event_store is db/jsonl
run list survives if run_store is SQL
thread list survives if thread_meta is SQL or persistent store
active asyncio task never survives process restart
SSE bridge never survives process restart
```

This turns implicit runtime behavior into an explicit product contract.

## Design Observation 4: In-flight Runs Need Ownership, Not Just Status

`RunManager.reconcile_orphaned_inflight_runs()` marks persisted `pending` / `running` rows as error when no local task owns them. This is good for SQLite single-node restart: it prevents the UI from showing a run as active forever.

For postgres or multi-worker deployments, the harder question is ownership:

```text
Which worker owns this run?
When did it last heartbeat?
Can another worker mark it failed?
Can another worker take it over?
Can a cancel request route to the owning worker?
```

For 3.0, run rows should carry a worker lease:

```text
worker_id
lease_expires_at
heartbeat_at
cancel_requested_at
cancel_action
```

That does not mean DeerFlow must support cross-worker takeover immediately. Even without takeover, the system can make cancellation and recovery semantics explicit:

```text
same worker active
  cancel by task handle.

other worker active
  route or reject with actionable status.

lease expired
  mark error or enqueue recovery.
```

## Design Observation 5: Thread Title Sync Is A Derived Projection

The canonical title lives in checkpoint channel values during graph execution. `run_agent()` later syncs it into `threads_meta.display_name` so `/threads/search` can list threads cheaply.

This is a projection:

```text
checkpoint.title -> threads_meta.display_name
```

Projection failures are non-fatal today, which is reasonable, but the UI can then show a stale title.

For 3.0, derived projections should be marked as derived:

```text
display_name
display_name_source_checkpoint_id
display_name_synced_at
```

This lets the API or a repair job know whether a list row is stale.

## Proposed 3.0 Shape

```text
PersistenceProfile
  one resolved startup object for all persistence factories.

PersistenceValidator
  rejects or clearly warns about incompatible combinations.

RecoveryContract
  surfaced in docs and health endpoint.

RunOwnershipLease
  makes active-run recovery and cancellation explicit.

ProjectionMetadata
  marks thread_meta fields derived from checkpoint state.
```

The goal is not to collapse every table into one store. The goal is to preserve useful separation while removing ambiguous configuration and recovery behavior.
