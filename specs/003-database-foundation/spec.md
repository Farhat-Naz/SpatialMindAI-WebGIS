# Feature Specification: Database Foundation

**Feature Branch**: `003-database-foundation`

**Created**: 2026-07-22

**Status**: Draft

**Input**: User description: "Create a complete feature specification for the first module of SpatialMindAI-WebGIS. Design and specify the complete database foundation for storing and managing GIS projects, layers, spatial features, attributes, and styles — supporting multiple projects, multiple layers per project, multiple geometry types (Point, MultiPoint, LineString, MultiLineString, Polygon, MultiPolygon) at SRID 4326, feature/layer/project CRUD, attribute storage, style storage, spatial indexing, geometry validation, and automatic timestamps."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manage Projects (Priority: P1)

A GIS user creates a project to serve as the container for a body of mapping work, gives it a name and description, updates those details as the work evolves, and removes the project entirely once it is no longer needed.

**Why this priority**: A project is the root container for everything else in this platform — no layer or feature can exist without one. This is the smallest possible slice that delivers standalone value (organizing work) and unblocks every other story.

**Independent Test**: Can be fully tested by creating a project, confirming it appears in the user's project list with the correct name/description, renaming it, and deleting it — with no layers or features involved at all.

**Acceptance Scenarios**:

1. **Given** a signed-in user with no existing projects, **When** they create a new project with a unique name, **Then** the project is saved and immediately visible in their project list with a creation timestamp.
2. **Given** an existing project, **When** the owner updates its name or description, **Then** the change is saved and an "updated at" timestamp is refreshed, while the "created at" timestamp remains unchanged.
3. **Given** an existing project, **When** the owner attempts to create a second project using the exact same name, **Then** the system rejects the request and clearly indicates the name is already in use.
4. **Given** an existing project, **When** the owner deletes it, **Then** the project and everything stored inside it (its layers, features, attributes, and styles) is permanently removed, and the project no longer appears in any listing.
5. **Given** an existing project owned by another user, **When** a different user attempts to update or delete it, **Then** the system rejects the request as unauthorized and the project is left unchanged.

---

### User Story 2 - Manage Layers Within a Project (Priority: P2)

A GIS user organizes spatial data inside a project into one or more layers (e.g., "Roads," "Parcels," "Points of Interest"), naming each one, changing its name later, controlling the order layers are drawn/listed in, and removing a layer when it's no longer needed.

**Why this priority**: Layers are the organizing unit within a project that every spatial feature must belong to. This story is independently testable once Project management (P1) exists, and delivers value (structuring a project's data) even before any actual spatial features are added.

**Independent Test**: Can be fully tested by creating a project, adding multiple layers to it, renaming one, changing their draw order, and deleting one — verified purely through layer listings and ordering, without needing any features present.

**Acceptance Scenarios**:

1. **Given** an existing project, **When** the owner creates a new layer with a name, **Then** the layer is saved under that project and appears in the project's layer list.
2. **Given** a project with an existing layer, **When** the owner creates another layer using the same name within that same project, **Then** the system rejects the request as a duplicate name.
3. **Given** a project with an existing layer, **When** the owner renames it, **Then** the new name is reflected immediately and the layer's identity (and all features within it) is preserved.
4. **Given** a project with multiple layers, **When** the owner changes the display/draw order of the layers, **Then** subsequent listings of that project's layers reflect the new order consistently.
5. **Given** a layer that contains spatial features, **When** the owner deletes the layer, **Then** the layer and every feature (with its attributes and style) stored inside it is permanently removed.

---

### User Story 3 - Manage Spatial Features, Attributes, and Styles (Priority: P3)

A GIS user adds spatial features (points, lines, or polygons) to a layer, edits a feature's location/shape or its descriptive attributes, sets how the feature should be visually styled, and deletes features that are no longer needed.

**Why this priority**: This is the ultimate purpose of the platform — storing the actual geographic data — but it depends on a project (P1) and a layer (P2) already existing, so it is correctly sequenced last while still being independently testable and demonstrable once the first two stories are in place.

**Independent Test**: Can be fully tested by creating a project and a layer, adding a feature with a valid shape, attribute values, and a style, then editing its shape/attributes/style, and finally deleting it — all verified independently of any other layer or project.

**Acceptance Scenarios**:

1. **Given** an existing layer, **When** the user adds a new feature with a valid, well-formed shape, **Then** the feature is saved and appears when the layer's features are retrieved, along with a creation timestamp.
2. **Given** an existing layer, **When** the user attempts to add a feature with a malformed or invalid shape (e.g., a polygon whose boundary crosses itself), **Then** the system rejects the submission with a clear explanation and no feature is saved.
3. **Given** an existing feature, **When** the user edits its shape or its descriptive attribute values, **Then** the stored feature reflects the new shape/attributes and its "updated at" timestamp is refreshed.
4. **Given** an existing feature, **When** the user sets or changes its visual style (e.g., color, line weight, fill), **Then** subsequent retrievals of that feature include the updated style.
5. **Given** an existing feature, **When** the user deletes it, **Then** it is permanently removed and no longer appears in the layer's feature list, while sibling features in the same layer are unaffected.
6. **Given** a layer, **When** the user retrieves its features, **Then** all returned shapes conform to one of the platform's supported geometry types and use a consistent geographic coordinate reference system.

---

### Edge Cases

- What happens when a project, layer, or feature name/ID that does not exist is requested, updated, or deleted? → The system MUST report that the resource was not found rather than silently succeeding or returning an empty result.
- What happens when two layers in the same project are assigned the same draw-order position? → The system MUST resolve or prevent order collisions so that a deterministic order is always returned.
- What happens when a feature is submitted with a geometry type that is not one of the six supported types? → The request MUST be rejected as invalid.
- What happens when a feature's coordinates fall outside the valid range for the platform's geographic coordinate system? → The request MUST be rejected as invalid.
- What happens when a user without ownership/access rights attempts to create, edit, or delete a project, layer, or feature? → The system MUST reject the action as unauthorized and MUST NOT reveal data the requester is not entitled to see.
- What happens when an underlying storage failure occurs mid-operation (e.g., the data store is temporarily unreachable)? → The system MUST report a distinguishable system-error outcome rather than a silent failure, and MUST NOT leave a partially-created project/layer/feature behind.
- What happens when a project is deleted while another user is actively viewing one of its layers? → The layer and its features MUST become unavailable (not found) on the next request; no corrupted or partial state should be observable.
- What happens when attribute data is submitted with no attributes at all? → The system MUST accept a feature with an empty attribute set; attributes are optional, not required.
- What happens when a feature is submitted without an explicit style? → The system MUST accept it and apply a documented default style.

## Requirements *(mandatory)*

### Functional Requirements

**Projects**

- **FR-001**: System MUST allow a user to create a project with a name and an optional description.
- **FR-002**: System MUST prevent a user from having two of their own projects with the exact same name.
- **FR-003**: System MUST allow a project's owner to update its name and/or description.
- **FR-004**: System MUST allow a project's owner to permanently delete it, which also permanently removes every layer, feature, attribute, and style stored within it.
- **FR-005**: System MUST allow any number of projects to exist at once, each independent of the others.
- **FR-006**: System MUST restrict project update and delete actions to the project's owner.

**Layers**

- **FR-007**: System MUST allow a project owner to create any number of layers within a project, each with a name.
- **FR-008**: System MUST prevent two layers within the same project from sharing the exact same name.
- **FR-009**: System MUST allow a layer's name to be changed without affecting the layer's stored features.
- **FR-010**: System MUST allow a project owner to permanently delete a layer, which also permanently removes every feature, attribute, and style stored within it.
- **FR-011**: System MUST allow a project owner to reorder the layers within a project and MUST consistently return layers in the most recently saved order on every subsequent retrieval.
- **FR-012**: System MUST allow a layer to contain features of more than one supported geometry type (mixed-geometry layers are permitted).

**Spatial Features**

- **FR-013**: System MUST allow a user to add a feature to a layer, consisting of a shape (geometry) and, optionally, a set of descriptive attributes and a visual style.
- **FR-014**: System MUST support exactly six geometry shapes for a feature: Point, MultiPoint, LineString, MultiLineString, Polygon, and MultiPolygon.
- **FR-015**: System MUST validate every submitted shape and reject any that is structurally invalid (e.g., self-intersecting polygon boundaries, unclosed polygon rings, empty geometries) before it is saved.
- **FR-016**: System MUST interpret and store every feature's coordinates using a single, consistent geographic coordinate reference system (the standard WGS84 longitude/latitude system) across the entire platform.
- **FR-017**: System MUST allow a user to edit an existing feature's shape independently of its attributes or style.
- **FR-018**: System MUST allow a user to permanently delete an individual feature without affecting any other feature in the same layer.

**Attributes**

- **FR-019**: System MUST allow each feature to store its own independent set of named descriptive attribute values (e.g., "Name," "Population," "Status"), with no requirement that features in the same layer share the same attribute names.
- **FR-020**: System MUST allow a feature to be created or edited with zero attributes (attributes are optional).
- **FR-021**: System MUST allow a user to add, change, or remove individual attribute values on an existing feature without affecting the feature's shape or style.

**Styles**

- **FR-022**: System MUST allow a user to define a visual style for an individual feature (at minimum: a color, an outline/line weight, and a fill or transparency setting appropriate to the feature's geometry).
- **FR-023**: System MUST apply a documented, consistent default style to any feature created without an explicit style.
- **FR-024**: System MUST allow a feature's style to be changed independently of its shape or attributes.

**Cross-Cutting**

- **FR-025**: System MUST record a creation timestamp and a last-updated timestamp for every project, layer, and feature automatically, without requiring the user to supply them.
- **FR-026**: System MUST make it possible to retrieve the features belonging to a specific layer efficiently, without a noticeable slowdown as the number of features in that layer grows into the hundreds of thousands.
- **FR-027**: System MUST distinguish, for every operation that can fail, between at least the following outcomes so a caller can react appropriately: the input was invalid, the requested resource was not found, the requested name conflicts with an existing one, the requester was not authorized, or an unexpected system failure occurred.
- **FR-028**: System MUST NOT allow a project, layer, or feature to be left in a partially-created or partially-deleted state if an operation fails partway through.

### Key Entities

- **User**: An account holder who owns projects. Represents identity and ownership; no additional profile data is in scope for this foundation.
- **Project**: A named, described container owned by exactly one User. Root of the data hierarchy — owns zero or more Layers. Has creation and last-updated timestamps. Project names are unique per owner.
- **Layer**: A named grouping of spatial data belonging to exactly one Project. Owns zero or more Features and has an explicit position determining its order relative to sibling layers in the same project. Layer names are unique per project. May contain features of more than one geometry type.
- **Feature**: A single spatial record belonging to exactly one Layer. Carries one geometry (Point, MultiPoint, LineString, MultiLineString, Polygon, or MultiPolygon) expressed in the platform's standard geographic coordinate system, plus creation and last-updated timestamps. Owns zero or more FeatureAttributes and at most one FeatureStyle.
- **FeatureAttribute**: A single named descriptive value (a name/value pair) belonging to exactly one Feature. A Feature may have any number of these, including none, and two Features in the same Layer are not required to share the same attribute names.
- **FeatureStyle**: The visual styling settings (color, outline, fill/transparency) belonging to exactly one Feature. A Feature has at most one FeatureStyle; if none is set explicitly, a documented default applies.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can create a new project and see it appear in their project list in under 2 seconds under normal conditions.
- **SC-002**: The platform supports at least 1,000 projects, each with at least 100 layers, without any degradation in project or layer listing responsiveness.
- **SC-003**: Retrieving all features in a layer containing 100,000 features returns in under 2 seconds under normal conditions.
- **SC-004**: 100% of feature submissions with structurally invalid geometry are rejected before being saved, with zero invalid shapes ever appearing in a subsequent retrieval.
- **SC-005**: 100% of attempts to create a project or layer with a duplicate name (within its required uniqueness scope) are rejected.
- **SC-006**: Deleting a project removes 100% of its associated layers, features, attributes, and styles — no orphaned records remain retrievable afterward.
- **SC-007**: 100% of update/delete attempts by a non-owner are rejected, with zero unauthorized changes ever taking effect.
- **SC-008**: Reordering layers within a project is reflected consistently in 100% of subsequent retrievals, with no flicker back to a stale order.

## Assumptions

- **Ownership model**: Each project is owned by exactly one User; there is no multi-user sharing, collaboration, or role-based permission model in this foundation phase. Only a project's owner may update or delete it or anything within it. Broader sharing/collaboration is a reasonable future extension, not required for this module.
- **Cascading deletion**: Deleting a project or layer is destructive and immediately removes everything nested beneath it (layers/features/attributes/styles). This matches standard behavior for hierarchical GIS data containers (e.g., ArcGIS Online "folders") and is treated as an intentional, irreversible action by the owner rather than a soft-delete/trash/recovery flow, which is out of scope for this module.
- **Feature attributes are free-form**: Attribute storage is unstructured per feature (each feature holds its own independent name/value pairs), not a fixed schema defined once per layer. This maximizes flexibility for the initial foundation; a layer-level schema/validation layer can be layered on top in a future module without breaking this data model.
- **Mixed-geometry layers are permitted**: A layer is not restricted to a single geometry type; features of different supported geometry types may coexist in the same layer.
- **Coordinate system**: All stored coordinates use the standard WGS84 geographic coordinate reference system (longitude/latitude), which is the universal default for web mapping platforms and ensures every feature, regardless of layer or project, is directly comparable and mappable without a conversion step.
- **Concurrency**: Simple last-write-wins semantics are assumed for concurrent edits to the same project, layer, or feature; real-time collaborative editing (e.g., simultaneous multi-user editing of one feature) is out of scope for this foundation module.
- **No versioning/history**: This module stores only the current state of each project, layer, and feature. Edit history, undo, or point-in-time recovery are out of scope for this module.
- **Default style**: A single documented platform-wide default style exists and is applied to any feature created without an explicit style; per-layer default styles are a reasonable future extension but not required here.
