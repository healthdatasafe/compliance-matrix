# Event history is opt-in; what the audit log records without it

Source-of-truth for every matrix claim about the prior values of an event
(rectification trails, amendment trails, document-control history,
"compare against the history"). Findings from reading open-pryv.io master
after 2.0.0-rc.38 directly: `config/default-config.yml`,
`storages/engines/postgresql/src/dataStore/localUserEventsPG.ts`,
`storages/engines/sqlite/src/dataStore/localUserEventsSQLite.ts`,
`storages/shared/DeletionModesFields.ts`,
`components/api-server/src/methods/events.ts`, `components/audit/src/Audit.ts`.

## The short answer for an implementer

- **Accesses always keep their history.** Every `accesses.update` snapshots
  the previous version (see `access-versioning.md`). Nothing below changes
  that: consent records carried by an access are versioned on every
  deployment.
- **Events keep their history only if you turn it on.** Pryv ships with
  `versioning.forceKeepHistory: false`. On that default, `events.update`
  overwrites the event in place and the prior value is gone; `events.getOne`
  with `includeHistory=true` answers with an empty `history`. If you need the
  prior values of events (a rectification or amendment trail, a document
  change history), set `versioning.forceKeepHistory: true` in your
  deployment's configuration.
- **Without event history, the audit log still says who changed which event,
  and when**, but not what the event held before (details below).

## Event history, per store and per setting

Both built-in user-data stores, PostgreSQL and SQLite, behave the same way.
With `forceKeepHistory: true`, the store writes a copy of the event as it was
(linked to the event by `headId`) before each update, each trash, each
attachment change, and before the final deletion. For an attachment added or
deleted, the copy is taken after the attachment list has changed (the merge
that follows the attachment write), so the previous version already shows
the new list: history does not recover a removed attachment reference.
With `false` (the default) they write none. A custom data store keeps
whatever history it implements, if any.

Some server writes never keep history, whatever the setting: the CMC plugin's
dispatch status stamps on a trigger event (one of them removes a credential,
which a history row would preserve), the shared-secrets payload scrub, and
the trash of a shared-secret event by its user (a compare-and-set).

`versioning.deletionMode` decides what survives the **final** deletion of an
event (the second `events.delete`, on an event already trashed):

| `deletionMode` | The deleted event keeps | Its history rows |
|---|---|---|
| `keep-nothing` (default) | id and deletion time only | deleted |
| `keep-authors` | id, deletion time, `modified`, `modifiedBy` | reduced to the same fields |
| `keep-everything` | all its fields | kept |

(In every mode the tombstone gets a fresh integrity hash of what it keeps.)

So on the default configuration an erased event leaves only a tombstone, which
is what an erasure request expects; `keep-everything` trades that for a
complete record and has to be justified against your erasure obligations.

## What the audit log records about event changes

The audit log is on by default (`audit.active: true`, every API method
audited) and does not depend on `versioning`. For each call it records the
access that made it (id and version), the time, the method, the source IP and
the URL query parameters; never the request body. In addition:

- an `events.create` or `events.update` row carries `content.record = { key,
  integrity }`: the key names the event and its new modification time
  (`EVENT:0:<id>:<modified>`), and `integrity` is the SHA-256 integrity hash
  of the event as written (integrity is on by default), test `[WNWM]` for
  the create case;
- an `events.delete` row (trash or final deletion) records who and when, but
  carries no record of which event: the event id is in the URL path, which is
  not recorded (from a code read; no test pins this). The same holds for
  `events.deleteAttachment`.

What this gives you without event history: who changed an event and when,
and a hash with which you can check that the event as stored now is the one
the last audited create or update produced (a mismatch can also come from an
audited trash or attachment deletion, whose row records no new hash). What it
does not give you: the previous
value, or the content of the change. A rectification or amendment trail that
must show the value before the correction needs `forceKeepHistory: true`, or
your app writes the correction as a new event that references the old one
and keeps both.

On account deletion the audit log is erased by default
(`audit.onUserDelete: erase`); `keep` retains it, see the erasure rows.
