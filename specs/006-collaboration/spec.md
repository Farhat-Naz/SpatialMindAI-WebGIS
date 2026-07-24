# Feature Specification: Real-Time Collaboration

**Feature Branch**: `006-collaboration`

**Created**: 2026-07-23

**Status**: Draft

**Input**: User description: "Create a complete specification for an enterprise-grade collaboration system for SpatialMindAI-WebGIS. Enable multiple users to collaborate on GIS projects safely, efficiently, and in real time. The collaboration system must support project sharing, permissions, comments, notifications, activity history, version history, feature locking, and offline synchronization." (Full nine-user-story breakdown — Project Sharing, Real-Time Collaboration, Feature Locking, Activity History, Version History, Comments, Notifications, Offline Editing, Presence — provided verbatim by the user and preserved below in the same order and numbering.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Project Sharing (Priority: P1)

A project owner shares one of their projects with other users so the team
can work on it together, controlling exactly who has access and what each
person is allowed to do.

**Why this priority**: Every other collaboration capability in this spec
depends on more than one user having access to the same project — sharing
is the gateway capability everything else builds on.

**Independent Test**: Can be fully tested by an owner inviting a second
user as Editor, confirming that user can now open the project, and
confirming a third user with no invitation cannot.

**Acceptance Scenarios**:

1. **Given** a project owner, **When** they invite another user and assign
   a role, **Then** that user gains access to the project at exactly that
   role's permission level.
2. **Given** a project with multiple members, **When** the owner removes a
   member, **Then** that user immediately loses access to the project.
3. **Given** a project with an Editor member, **When** the owner changes
   that member's role to Viewer, **Then** the member can no longer edit
   data on their next action.
4. **Given** a project owner, **When** they transfer ownership to another
   existing member, **Then** that member becomes Owner and the prior owner
   becomes an Editor (never left with no access to a project they
   originated).
5. **Given** a non-owner member (Editor or Viewer), **When** they attempt
   to invite, remove, or change the role of another member, **Then** the
   action is rejected — only the Owner manages membership.
6. **Given** an Editor, **When** they attempt to transfer project
   ownership, **Then** the action is rejected — only the Owner may transfer
   ownership.
7. **Given** a Viewer, **When** they attempt to create, edit, or delete a
   layer or feature, **Then** the action is rejected and the data is
   unchanged.

---

### User Story 2 - Real-Time Collaboration (Priority: P2)

Multiple invited members open the same project at the same time and see
each other's map and data changes as they happen, without needing to
manually refresh the page.

**Why this priority**: This is the core value proposition of
"collaboration" — sharing access (US1) with no live synchronization would
just be multiple people taking turns, not truly working together.

**Independent Test**: Can be fully tested by two members opening the same
project in two separate sessions; one draws a feature and the other sees
it appear without refreshing.

**Acceptance Scenarios**:

1. **Given** two members viewing the same project, **When** one creates,
   edits, or deletes a feature, **Then** the other sees that change reflected
   on their map within a few seconds, with no manual refresh.
2. **Given** two members viewing the same project, **When** one creates,
   renames, reorders, or removes a layer, **Then** the other's Layer Tree
   reflects that change without a manual refresh.
3. **Given** two members in the same project, **When** one moves their map
   view or their cursor over the map, **Then** the other can see a live
   indicator of that member's cursor position and current map extent.
4. **Given** a member actively viewing a project, **When** their network
   connection drops, **Then** they see a clear "reconnecting" indicator and
   the session automatically reconnects and resynchronizes once the
   connection returns, with no manual reload required.
5. **Given** a member joins or leaves an open project session, **When**
   that happens, **Then** every other active member's presence list
   updates automatically to reflect it.

---

### User Story 3 - Feature Locking (Priority: P3)

While one member is actively editing a feature's geometry or attributes,
the system prevents any other member from editing that same feature at the
same time, so two people's simultaneous edits can never silently overwrite
each other.

**Why this priority**: Real-time visibility (US2) alone does not prevent a
data-corrupting conflict if two members edit the same feature at the same
moment — locking is the safety mechanism real-time collaboration requires
to be trustworthy for real editing work, not just viewing.

**Independent Test**: Can be fully tested by one member entering edit mode
on a feature and confirming a second member sees it as locked and cannot
enter edit mode on it themselves.

**Acceptance Scenarios**:

1. **Given** a feature not currently being edited, **When** a member enters
   edit mode on it, **Then** the feature becomes locked to that member and
   every other member sees a visual lock indicator on it.
2. **Given** a feature locked by another member, **When** a second member
   attempts to edit it, **Then** the attempt is blocked with a clear
   message naming who holds the lock.
3. **Given** a feature locked by a member who saves their edit, **When**
   the save completes, **Then** the lock is released immediately and the
   feature becomes editable by others.
4. **Given** a feature locked by a member who cancels their edit, **When**
   they cancel, **Then** the lock is released immediately with no change
   to the feature.
5. **Given** a feature locked by a member who becomes inactive (closes
   their browser, loses connection, or simply stops interacting) without
   explicitly saving or canceling, **When** the lock's timeout elapses,
   **Then** the lock is automatically released so the feature is not
   permanently stuck.

---

### User Story 4 - Activity History (Priority: P4)

Any project member can review a chronological timeline of every
significant action taken on the project, to understand who did what and
when.

**Why this priority**: Once multiple people can edit the same project
(US1–US3), a shared, trustworthy record of who-did-what becomes necessary
for accountability — but it is a read/reporting capability that does not
block editing from working, so it is ordered after the capabilities that
generate the activity it records.

**Independent Test**: Can be fully tested by performing one tracked action
(e.g., creating a layer) and confirming it appears at the top of the
project's activity timeline with the correct user, timestamp, and action.

**Acceptance Scenarios**:

1. **Given** a project with any history, **When** a member opens the
   Activity History, **Then** every recorded action is listed newest
   first, each showing the acting user, a timestamp, the action type, and
   the specific target it acted on (layer, feature, member, version, etc.).
2. **Given** any of: a create, edit, delete, import, export, share,
   permission change, or version restore, **When** that action occurs,
   **Then** it is recorded in Activity History automatically, with no
   member action required to log it.
3. **Given** a long-running project, **When** the activity list grows
   large, **Then** the timeline remains usable (e.g., paginated) rather
   than degrading.

---

### User Story 5 - Version History (Priority: P5)

A project member can save a named snapshot of the project's current state,
see prior snapshots, compare two of them, and restore the project back to
an earlier one without losing anything that happened since.

**Why this priority**: Version History is a safety net that matters once
real collaborative editing (US1–US3) is already happening and generating
meaningful project evolution to snapshot and potentially recover from.

**Independent Test**: Can be fully tested by saving a version, making a
further change, restoring the saved version, and confirming the project
reverts while the intervening change is still visible in version history
(not deleted).

**Acceptance Scenarios**:

1. **Given** a project in any state, **When** a member explicitly saves a
   version with an optional note, **Then** a new snapshot is recorded
   capturing the project's current layers/features.
2. **Given** a successful data import (per 004-map-editing-ui), **When**
   the import completes, **Then** a version is automatically saved
   beforehand — capturing the state immediately prior to the import — with
   no member action required.
3. **Given** two saved versions, **When** a member compares them, **Then**
   the differences between the two (added/changed/removed layers or
   features) are shown.
4. **Given** a saved version, **When** a member restores it, **Then** the
   project's current state is replaced with that version's content **and**
   a new version is created capturing the state immediately before the
   restore — so the restore itself is undoable and no prior version is
   ever deleted.

---

### User Story 6 - Comments (Priority: P6)

Project members discuss specific features directly on the map by leaving
comments, replying to each other, resolving finished discussions, and
mentioning teammates to draw their attention.

**Why this priority**: Comments are a richer communication layer that adds
value once people are already collaborating on the same data (US1–US3);
the project remains fully usable without them.

**Independent Test**: Can be fully tested by one member commenting on a
feature and a second member seeing and replying to that comment.

**Acceptance Scenarios**:

1. **Given** a feature, **When** a member adds a comment on it, **Then**
   every other member with access to the project can see that comment.
2. **Given** an existing comment, **When** a member replies to it,
   **Then** the reply is shown threaded under the original comment.
3. **Given** an open comment thread, **When** a member marks it resolved,
   **Then** it is visually distinguished as resolved but remains visible in
   history — never deleted by resolving it.
4. **Given** a comment being written, **When** the author mentions another
   project member, **Then** that member receives a notification (US7).
5. **Given** a member's own comment, **When** they edit or delete it,
   **Then** the change is applied; a member can never edit or delete
   another member's comment.

---

### User Story 7 - Notifications (Priority: P7)

Project members are notified of collaboration events relevant to them —
being added to a project, being mentioned, a lock conflict, and more —
without needing to actively watch for them.

**Why this priority**: Notifications make every other capability above
(sharing, comments, locking, version restores) usable passively rather
than requiring constant polling by the user, so they are layered on top of
those capabilities rather than being a prerequisite for them.

**Independent Test**: Can be fully tested by one member sharing a project
with another and confirming the invited user receives a notification.

**Acceptance Scenarios**:

1. **Given** any of: a project shared with a user, an invitation accepted,
   a comment added on a feature the user is watching, a mention, a version
   restored, a feature assigned, or a lock conflict, **When** that event
   occurs, **Then** the relevant user(s) receive a notification recording
   what happened and when.
2. **Given** a list of notifications, **When** a member marks one (or all)
   as read, **Then** its read state updates accordingly.
3. **Given** any number of unread notifications, **When** a member views
   their notification indicator, **Then** an accurate unread count is
   shown.

---

### User Story 8 - Offline Editing (Priority: P8)

A member who temporarily loses network connectivity can keep working —
their edits are captured locally and automatically synchronized once
connectivity returns, without losing any work.

**Why this priority**: This is the most complex and most self-contained
capability in this spec — it meaningfully improves resilience but every
other collaboration capability already delivers standalone value without
it, so it is ordered last among the "requires new infrastructure" stories.

**Independent Test**: Can be fully tested by disconnecting a client from
the network, making an edit, reconnecting, and confirming the edit is
synchronized without the user re-entering it.

**Acceptance Scenarios**:

1. **Given** a member loses network connectivity mid-session, **When**
   they continue creating or editing features, **Then** those edits are
   cached locally rather than lost.
2. **Given** locally cached edits, **When** connectivity returns, **Then**
   they are automatically queued and submitted in order with no manual
   action required.
3. **Given** a queued edit that fails to submit (e.g., a transient server
   error), **When** the failure occurs, **Then** the system automatically
   retries rather than silently dropping the edit.
4. **Given** a locally cached edit that conflicts with a change made by
   someone else while the member was offline (e.g., the same feature was
   also edited or deleted server-side), **When** synchronization detects
   the conflict, **Then** the conflict is surfaced to the member for
   resolution — the system never silently discards either version to
   force a resolution.

---

### User Story 9 - Presence (Priority: P9)

A member can see, at a glance, exactly who else is currently active in the
project, where they're looking, and what they're doing.

**Why this priority**: Presence is a visibility layer that depends on the
real-time and locking infrastructure above (US2, US3) already existing to
have anything to display — it is the last piece that ties the "who is
here and what are they doing right now" picture together.

**Independent Test**: Can be fully tested by two members opening the same
project and each seeing the other listed as active, with the other's
approximate map view shown.

**Acceptance Scenarios**:

1. **Given** a project with active members, **When** a member views the
   presence indicator, **Then** every currently active member is listed.
2. **Given** an active member, **When** they move their cursor over the
   map, **Then** other members see that live cursor position.
3. **Given** an active member, **When** they pan or zoom the map, **Then**
   other members can see their current map view (per US2).
4. **Given** an active member currently editing a specific feature,
   **When** other members view presence, **Then** that member is shown as
   editing that specific feature (consistent with its lock indicator, US3).
5. **Given** an active member, **When** they disconnect or close the
   project, **Then** their presence indicator disappears for other members
   shortly afterward, not immediately (allowing for brief network blips)
   and not indefinitely (never leaving a stale "still here" indicator).

---

### Edge Cases

- **Network disconnect**: Handled by US2's acceptance scenario 4
  (auto-reconnect) and US8 (offline editing) — a disconnect must never
  silently lose a member's in-progress work.
- **Duplicate invitations**: Inviting a user who already has a pending
  invitation or existing membership to the same project MUST NOT create a
  second invitation or duplicate membership — the existing one is left
  as-is when the invite is submitted a second time.
- **Expired locks**: A feature lock whose holder has gone inactive past the
  timeout MUST be automatically released (US3) and the feature MUST become
  immediately editable by others — never permanently stuck.
- **Deleted users**: If a project member's user account is removed from
  the platform, their project memberships MUST be removed, their prior
  Activity History/comment/version entries MUST remain attributed to them
  (never deleted or reattributed), and any feature lock or presence session
  they held MUST be released immediately, not wait for a timeout.
- **Simultaneous edits**: Two members MUST NOT be able to acquire a lock on
  the same feature at the same time — feature locking (US3) is the
  mechanism that prevents this at the source, not a resolution applied
  after the fact.
- **Offline conflicts**: A locally-queued offline edit that conflicts with
  a server-side change made while the member was disconnected MUST be
  surfaced to the member, never silently auto-applied or silently
  discarded (US8, scenario 4).
- **Permission changes during editing**: If a member's role is downgraded
  (Editor → Viewer) or their access is removed while they have an
  in-progress edit or an active feature lock, their lock MUST be released
  and any further write attempt MUST be rejected immediately — the change
  takes effect on their very next action, not just their next session.
- **Version restore conflicts**: If a version restore is requested while
  other members are actively editing the project, the restore MUST still
  proceed (creating a new version first, per US5 scenario 4) and every
  active member MUST be clearly notified that the project was just reset
  to an earlier state, so no one keeps editing against data that no longer
  exists without knowing why.
- What happens when the Owner is removed from the platform entirely (the
  deleted-user case above) and no other member exists? The project has no
  usable Owner going forward — this scenario requires an explicit
  ownership-succession or project-archival decision, called out as an
  Assumption below rather than silently guessed.
- What happens when two members reply to and resolve the same comment
  thread at nearly the same moment? The thread's final state (resolved,
  with both replies present) MUST reflect both actions — resolving MUST
  NOT remove or hide a reply submitted around the same time.

## Requirements *(mandatory)*

### Functional Requirements

**Project Sharing**

- **FR-001**: The system MUST let a project's Owner invite another
  platform user to the project with an assigned role (Editor or Viewer).
- **FR-002**: The system MUST let a project's Owner remove any non-owner
  member from the project, immediately revoking that member's access.
- **FR-003**: The system MUST let a project's Owner transfer ownership to
  an existing Editor or Viewer member; the prior Owner becomes an Editor
  (never left without access).

**Permissions**

- **FR-004**: The system MUST support exactly three project-level roles:
  Owner, Editor, and Viewer, each with a fixed, documented set of allowed
  actions.
- **FR-005**: A Viewer MUST be able to view every layer/feature/comment/
  activity/version the project exposes, and MUST NOT be able to create,
  edit, or delete any of them.
- **FR-006**: An Editor MUST be able to create, edit, and delete layers
  and features (per 004-map-editing-ui's existing capabilities), add
  comments, and save versions, and MUST NOT be able to manage membership
  or transfer ownership.
- **FR-007**: An Owner MUST be able to do everything an Editor can, plus
  manage membership (invite/remove/change role) and transfer ownership.

**Role Enforcement**

- **FR-008**: Every write action MUST be checked against the acting
  member's current role at the moment of the action, not a cached or
  session-start-time role — a role change takes effect immediately (Edge
  Cases: permission changes during editing).
- **FR-009**: A role-forbidden action MUST be rejected with a clear
  message identifying it as a permissions issue, never silently ignored or
  presented as a generic error.

**Invitations**

- **FR-010**: An invitation MUST record the inviting Owner, the invited
  user, the assigned role, and its current status (pending, accepted,
  declined, or expired).
- **FR-011**: Submitting an invitation for a user who already has a
  pending invitation or existing membership on the same project MUST NOT
  create a duplicate — the existing invitation or membership is
  unaffected (Edge Cases).
- **FR-012**: An invited user MUST be able to accept or decline an
  invitation; accepting grants project access at the assigned role and
  notifies the inviting Owner (US7).

**Member Management**

- **FR-013**: The system MUST let any project member view the full list of
  current members and their roles.
- **FR-014**: Only the project's Owner MUST be able to change a member's
  role or remove a member (FR-007; US1 acceptance scenario 5).

**Live Collaboration**

- **FR-015**: The system MUST propagate a feature create/edit/delete to
  every other active member's view of the project without requiring a
  manual refresh.
- **FR-016**: The system MUST propagate a layer create/rename/reorder/
  delete to every other active member's Layer Tree without requiring a
  manual refresh.
- **FR-017**: The system MUST show each active member's current cursor
  position and map extent to every other active member in the same
  project.
- **FR-018**: The system MUST automatically re-establish an active
  member's live connection and resynchronize their view after a
  temporary network disconnect, without requiring a manual page reload.

**Feature Locking**

- **FR-019**: Entering edit mode on a feature MUST acquire an exclusive
  lock on that feature for the acting member; no other member MAY acquire
  a concurrent lock on the same feature.
- **FR-020**: Saving or canceling an edit MUST release that feature's lock
  immediately.
- **FR-021**: A lock MUST be automatically released after a period of
  holder inactivity (Assumptions — default duration), so an abandoned
  edit never permanently blocks a feature.
- **FR-022**: Every member MUST see a visual indicator on any feature
  currently locked by another member, including who holds the lock.

**Activity History**

- **FR-023**: The system MUST automatically record every create, edit,
  delete, import, export, share, permission change, and version restore
  action taken on a project, with no explicit logging action required by
  the member performing it.
- **FR-024**: Each Activity History entry MUST record the acting user,
  a timestamp, the action type, and the specific target the action applied
  to.
- **FR-025**: Activity History MUST be viewable as a timeline ordered
  newest first, remaining usable (e.g., paginated) regardless of a
  project's total history size.

**Version History**

- **FR-026**: The system MUST let a member explicitly save a named version
  snapshot of the project's current layers/features, with an optional
  note.
- **FR-027**: The system MUST automatically save a version snapshot
  immediately before a data import completes, capturing the pre-import
  state.
- **FR-028**: The system MUST let a member restore a prior version,
  replacing the project's current state with that version's content.
- **FR-029**: Restoring a version MUST first save a new version capturing
  the state immediately before the restore — no version is ever deleted by
  a restore.
- **FR-030**: The system MUST let a member compare two versions and see
  what was added, changed, or removed between them.

**Comments**

- **FR-031**: The system MUST let a member add a comment on a specific
  feature, visible to every other project member.
- **FR-032**: The system MUST let a member reply to an existing comment,
  shown threaded under it.
- **FR-033**: The system MUST let a member mark a comment thread resolved;
  a resolved thread MUST remain visible in history, never deleted by
  resolving it.
- **FR-034**: The system MUST let a member mention another project member
  within a comment, triggering a notification to the mentioned member.
- **FR-035**: A member MUST be able to edit or delete only their own
  comments, never another member's.

**Notifications**

- **FR-036**: The system MUST generate a notification for each of: a
  project shared with a user, an invitation accepted, a comment added on a
  feature the user is watching, a mention, a version restored, a feature
  assigned to the user, and a lock conflict encountered by the user.
- **FR-037**: The system MUST let a member mark one or all of their
  notifications as read.
- **FR-038**: The system MUST expose an accurate unread-notification count
  to each member.

**Offline Synchronization**

- **FR-039**: The system MUST cache a member's edits locally when made
  while disconnected, rather than losing them.
- **FR-040**: The system MUST queue locally-cached edits and automatically
  submit them, in the order made, once connectivity returns.
- **FR-041**: A queued edit that fails to submit MUST be automatically
  retried rather than silently dropped.

**Conflict Resolution**

- **FR-042**: A locally-queued offline edit that conflicts with a
  server-side change made during the member's disconnection MUST be
  surfaced to the member for resolution — the system MUST NOT silently
  discard either the local or the server version.
- **FR-043**: Two members MUST NOT be able to hold a lock on, and thereby
  edit, the same feature at the same time (US3 is the sole mechanism
  preventing this class of conflict at the source).

**Presence**

- **FR-044**: The system MUST show every currently active member of a
  project to every other active member.
- **FR-045**: The system MUST show each active member's current cursor
  position, map view, and — when applicable — the specific feature they
  are currently editing.
- **FR-046**: A member's presence indicator MUST disappear for other
  members shortly after they disconnect or leave the project (Assumptions
  — default duration), never instantly (tolerating brief network blips)
  and never indefinitely (never showing a stale "still here").

**Audit Logging**

- **FR-047**: Activity History (FR-023–FR-025) MUST function as this
  project's audit log — every recorded entry MUST be immutable (never
  editable or deletable by any member, including the Owner) once
  recorded.
- **FR-048**: An Activity History entry's acting-user attribution MUST be
  preserved even if that user is later removed from the project or the
  platform (Edge Cases: deleted users).

### Non-Functional Requirements

- **Performance**: A collaborator's change MUST become visible to other
  active members within a few seconds under normal network conditions
  (see SC-002).
- **Scalability**: The collaboration capabilities in this spec MUST
  remain usable as a project's member count and activity/version/comment
  history grow, without requiring a redesign of this feature (e.g., via
  pagination on history/comment/notification lists, per FR-025).
- **Reliability**: No member's edit MUST ever be silently lost due to a
  network interruption, a lock conflict, or an offline/online transition
  (US2, US3, US8 acceptance scenarios collectively guarantee this).
- **Availability**: A temporary loss of real-time connectivity MUST
  degrade gracefully to a clear "reconnecting" state and automatic
  recovery (FR-018), never to data loss or a broken/unusable session.
- **Security**: Every collaboration action MUST be checked against the
  existing project ownership/membership model (FR-008, FR-009) — a user
  without project access MUST NOT be able to view or act on that project's
  data, comments, activity, or versions through any collaboration surface
  introduced by this feature.
- **Accessibility**: Every new interactive collaboration surface (member
  management, comments, notifications, version history, presence
  indicators) MUST be keyboard-operable and carry accessible names,
  consistent with this platform's existing accessibility standard (WCAG
  2.2 AA).
- **Maintainability**: This feature MUST integrate with, and MUST NOT
  redesign, the existing Project/Layer/Feature data model or any
  previously delivered feature's architecture.
- **Offline resilience**: A member working offline MUST be able to
  continue creating and editing features locally for the duration of the
  disconnection, with automatic, ordered, conflict-safe synchronization
  once reconnected (US8).

### Key Entities

- **Project Member**: A user's association with one project at a specific
  role (Owner, Editor, or Viewer); exactly one Owner per project at any
  time.
- **Invitation**: A pending, accepted, declined, or expired request for a
  specific user to join a specific project at a specific role.
- **Feature Lock**: An exclusive, time-limited claim by one member on one
  feature, held only while that member is actively editing it.
- **Activity History Entry**: An immutable record of one significant
  action taken on a project — its type, acting user, timestamp, and
  target.
- **Project Version**: A named, timestamped snapshot of a project's
  layers/features at a point in time, with an optional note and the member
  who created it.
- **Comment**: A member's note attached to a specific feature, optionally
  a reply to another comment, with a resolved/unresolved state and any
  mentioned members.
- **Notification**: A record that a specific event relevant to a specific
  user occurred, with a read/unread state.
- **Presence Session**: A currently-active member's live cursor position,
  map view, and (if any) the feature they are currently editing, within
  one project.
- **Offline Edit Queue Entry**: A locally-cached edit made while
  disconnected, awaiting submission, with a status (queued, submitted,
  retrying, or conflicted).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A newly-invited member can go from receiving their
  invitation to viewing the shared project in under 1 minute.
- **SC-002**: A collaborator's feature or layer change becomes visible to
  every other active member within 5 seconds under normal network
  conditions.
- **SC-003**: Zero instances of two members successfully editing the same
  feature at the same time — feature locking prevents 100% of this
  conflict class.
- **SC-004**: 100% of tracked actions (create/edit/delete/import/export/
  share/permission-change/version-restore) appear in Activity History with
  correct user, timestamp, and target.
- **SC-005**: A member who works offline for up to 30 minutes and
  reconnects has 100% of their offline edits either successfully
  synchronized or clearly flagged as a conflict for their review — never
  silently lost.
- **SC-006**: A member disconnecting from an active session is no longer
  shown as present to others within 30 seconds, and never remains shown as
  present indefinitely after a genuine disconnect.
- **SC-007**: Restoring a prior version never reduces the total number of
  versions available in history — it always results in one more version
  than existed before the restore.
- **SC-008**: 95% of members can find and use project sharing, commenting,
  and version restore without external help on their first attempt.

## Assumptions

- **Feature lock timeout**: An inactive lock is automatically released
  after 15 minutes of no activity from its holder — long enough to cover a
  normal editing pause, short enough that an abandoned edit does not block
  a feature for an entire session.
- **Presence disconnect timeout**: A member's presence indicator is
  removed 30 seconds after their last activity signal — long enough to
  tolerate a brief network blip, short enough to stay meaningfully
  "live."
- **Offline conflict resolution**: Conflicting offline edits are never
  auto-resolved by a rule like "last write wins" — both the local and
  server versions are always preserved and surfaced to the member, since
  the acceptance criteria for this feature explicitly require that no
  edit is ever silently lost.
- **Notification delivery channel**: Notifications (US7) are delivered
  in-app only (a notification list/indicator within the product) for this
  iteration; email or other external delivery channels are a future
  enhancement, not part of this spec.
- **Real-time propagation mechanism**: "Real-time"/"live" in this spec
  describes user-visible behavior (a change appears automatically, within
  a few seconds, with no manual refresh) — the specific transport
  mechanism achieving that is an implementation decision made in this
  feature's planning phase, not a constraint imposed by this spec.
- **Sharing scope**: Sharing, roles, and permissions in this spec are
  scoped to one Project at a time (matching the platform's existing
  Project → Layer → Feature hierarchy) — there is no cross-project or
  organization-wide sharing concept in this iteration.
- **Comment scope**: Comments attach to individual features only (not to
  layers or whole projects) in this iteration.
- **Deleted-owner succession**: If a project's Owner is removed from the
  platform and no other member exists on that project, the project is
  retained (not deleted) and flagged as ownerless pending an
  administrative resolution — a fully-automated succession rule is out of
  scope for this iteration.
- **Existing feature reuse**: This feature reuses the existing
  authentication seam, Project/Layer/Feature data model, and Route
  Handler/repository architecture established by 001–004 exactly as they
  are — it does not redesign or replace any of them.

## Out of Scope

- Authentication implementation (login, sessions, identity) — this
  feature consumes whatever user identity the platform already resolves;
  it does not build or change authentication itself.
- Billing, seats, or subscription management for collaboration features.
- Organization/team management above the level of a single project's
  membership list.
- Video or voice communication between collaborators.
- Advanced multi-step workflow or approval chains (e.g., "changes require
  approval before publishing") — this spec's permission model is Owner/
  Editor/Viewer only, with no approval-workflow layer.
