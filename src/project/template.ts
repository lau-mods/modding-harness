export const projectTemplate = `# Project

Status: draft

Project ID:
Mod ID:

## Platform

Minecraft:
NeoForge:
Java:

## Purpose

<!-- Describe the player-visible purpose. Finalize all product decisions before Status: active. -->

## Scope

### In Scope

<!-- List the capabilities included in this project. -->

### Non-goals

<!-- State deliberate exclusions; these are not future promises. -->

## Terminology

<!-- Define product terms used by the requirements. -->

## Features

<!-- Add concrete features using the following heading structure. Keep IDs stable.
### F-001: Feature name
#### Description
Observable purpose.
#### Requirements
##### R-F001-001: Requirement name
Observable behavior; avoid implementation choices.
#### Acceptance Criteria
##### AC-F001-001: Criterion name
Preconditions:
Initial player/world conditions.

Action:
The player action.

Expected Result:
An observable, unambiguous outcome.

Verification:
- gametest
Use only the necessary types: unit, gametest, e2e, visual, persistence, multiplayer.
-->

## Cross-cutting Requirements

### Persistence

<!-- Specify what must survive saving, shutdown and world reload, or None. -->

### Multiplayer

<!-- Describe server authority and other players' observations, or None. -->

### Visual

<!-- Describe visible appearance and reference assets, or None. -->

### Performance

<!-- State measurable constraints and measurement conditions, or None. -->

### Compatibility

<!-- List required environments/mod combinations, or None. -->

## Constraints

<!-- Record accepted restrictions, or None. -->

## Open Questions

<!-- Record unresolved product decisions. Replace this section body with None. when resolved. -->
`;
