# Non-Technical UX Rework

**Date:** 2026-07-27
**Status:** Approved, implementing

## Problem

Flowys is positioned as a personal workflow automation app, but eleven places in
the UI require the user to read or write JSON, dotted field paths, or
functional-programming vocabulary. A non-technical user cannot run a workflow
without hand-writing a JSON object.

Inventory of what the UI currently demands:

| Where | What it demands | File |
| --- | --- | --- |
| Run dialog | Hand-written JSON | `components/panels/Header.tsx:548` |
| Schedule input | Hand-written JSON | `components/panels/SchedulesPanel.tsx:195` |
| Input field types | `String / Number / Boolean / JSON` | `NodeConfigPanel.tsx:244` |
| Logic operations | `Transform / Filter / Map / Reduce / Condition` | `NodeConfigPanel.tsx:673` |
| Logic conditions | Expressions like `item.score > 80` | `NodeConfigPanel.tsx:681` |
| AI prompt variables | Typing `{{variableName}}` from memory | `NodeConfigPanel.tsx:524` |
| AI output schema | `string/number/boolean/array/object` | `NodeConfigPanel.tsx:596` |
| API response mapping | Dotted paths — `response.data.field` | `NodeConfigPanel.tsx:413` |
| API request body | Raw JSON plus `{{}}` templating | `NodeConfigPanel.tsx:396` |
| Webhook payload | Raw JSON template | `NodeConfigPanel.tsx:1225` |
| Integration params | JSON for any array/object field | `NodeConfigPanel.tsx:1078` |

## Goals

1. No JSON textarea anywhere in the product.
2. No capability lost — every setting editable today stays editable.
3. Every saved workflow keeps working, untouched.
4. No new runtime dependencies.

## Non-goals

- Changing the execution engine. `lib/engine/executor.ts` is not modified.
- Changing stored config shapes. This is a presentation-layer rework.
- Adding a test framework. The repo has none; see Verification.

## Key decision: coverage by construction

Removing the JSON escape hatch is only safe if the forms provably cover every
config shape. Enumerating known shapes cannot provide that guarantee — the first
saved workflow with an unanticipated shape would have an uneditable setting.

Therefore the foundation is a **recursive structural editor** that mirrors the
grammar of JSON itself:

- object → labeled key/value rows with add and remove
- array → numbered list with add, remove, and reorder
- string / number / boolean → typed input

There is no JSON value this cannot represent, so coverage is guaranteed by
construction rather than by enumeration. Deeply nested values look clunky but
remain fully editable. Higher-traffic sites get purpose-built forms on top of
this foundation; the structural editor is the floor, never the ceiling.

## Key decision: `{{variables}}` are hidden, not removed

The `{{name}}` templating grammar is interpreted server-side at `ai.ts:68`,
`api.ts:237`, `webhook.ts:173`, and `output.ts:96`. Removing it would be an
engine change and would break every saved workflow.

Instead the UI stops requiring users to type or read it. `FieldPicker` inserts a
token that displays as a chip reading *"Customer email (from Step 2)"* while
`{{customerEmail}}` is what gets stored. The engine is untouched.

## Architecture

### New modules

| Module | Purpose |
| --- | --- |
| `lib/utils/template.ts` | Single shared `interpolateVariables` plus token parsing and formatting |
| `lib/utils/fields.ts` | Derives available upstream fields by walking the graph backwards |
| `lib/vocabulary.ts` | Single source of truth mapping stored values to plain-language labels |
| `components/inputs/ValueEditor.tsx` | Recursive structural editor — the coverage guarantee |
| `components/inputs/RunForm.tsx` | Generates a labeled form from `InputNodeConfig.fields` |
| `components/inputs/FieldPicker.tsx` | "Insert a value from an earlier step", built on existing `dropdown-menu` |
| `components/inputs/TemplateInput.tsx` | Text input rendering stored `{{name}}` tokens as readable chips |
| `components/inputs/KeyValueEditor.tsx` | Extracted from the existing Headers editor pattern |
| `components/inputs/ConditionBuilder.tsx` | `[field] [is greater than] [value]` instead of an expression string |

### Refactor in place

`interpolateVariables` is currently duplicated across four node handlers. The
field picker must agree with the engine on token grammar, so four copies is a
latent bug. All four call sites move to `lib/utils/template.ts`. Behavior is
identical; this is a deduplication, not a change.

### Data flow: running a workflow

`Header.handleRun` stops parsing JSON and branches on the graph:

- No input node, or an input node with no declared fields → **no dialog at all**,
  run immediately. This removes the modal from the majority of runs.
- Fields declared → render `RunForm`, collect typed values, pass the resulting
  object to the existing `executeWorkflow(input)`.

`InputNodeHandler` already coerces strings to numbers and booleans at
`input.ts:58-86`, so no server-side change is required.

### Data flow: deriving picker fields

`FieldPicker` walks edges backwards from the selected node, the same reverse
traversal the executor performs at `executor.ts:103`. Each upstream node
contributes its declared outputs:

- input node → its `fields`
- AI node → its `outputSchema.properties`
- API node → its `responseMapping` keys
- integration node → its action's output keys

A node that declares nothing contributes the keys of its most recent actual
output from `lastExecution`, so the picker improves markedly after a first test
run. Nodes are labeled by position — "from Step 2" — using topological order, so
labels match what the user sees on the canvas.

## Vocabulary

Stored values never change. Only labels change.

### Field and schema types

| Stored | Label |
| --- | --- |
| `string` | Text |
| `number` | Number |
| `boolean` | Yes / No |
| `json`, `object` | Group of fields |
| `array` | List of items |

### Logic operations

| Stored | Label | Help text |
| --- | --- | --- |
| `transform` | Rename or restructure fields | Build a new set of fields from the ones coming in |
| `filter` | Keep only items that match | Drop list items that fail a rule |
| `map` | Change every item in a list | Apply the same edit to each item |
| `reduce` | Combine a list into one value | Add up or merge all items into a single result |
| `condition` | Take a different path | Send the workflow one way or another based on a rule |
| `sort` | Reorder a list | |
| `slice` | Take part of a list | |
| `passthrough` | Pass data through unchanged | |

### HTTP methods

Kept, with plain-language framing: "Get data (GET)", "Send new data (POST)",
"Replace data (PUT)", "Update part of data (PATCH)", "Delete data (DELETE)".

### Condition operators

`is`, `is not`, `is greater than`, `is less than`, `contains`, `does not
contain`, `is empty`, `is not empty` — compiled to the existing expression
string the engine already parses.

## Error handling

- Required fields are validated in `RunForm` before the run button enables.
  Messages appear inline under the field, not as a toast.
- The `Invalid JSON input` toast branch in `Header.handleRun` is deleted; JSON
  can no longer be malformed because it is no longer typed.
- Execution errors keep their existing toast and the `analyzeError` output from
  `executor.ts:120`, which is already written in plain language.
- `ValueEditor` cannot produce invalid state, so it has no error path. Renaming a
  key to one that already exists is prevented rather than reported.

## Backward compatibility

Every change is presentation-layer. Stored config keeps its current shape, so:

- existing saved workflows load and run unchanged
- existing schedules keep firing with their stored input
- the API at `app/api/v1` is untouched
- rolling this back is a UI revert with no data migration

`InputNodeConfig.fields` gains three optional properties — `label`,
`description`, `placeholder`. All optional, so existing configs remain valid;
where `label` is absent the UI falls back to a humanized `name`.

## Verification

The repo has no test framework — `package.json` declares no test runner, and
adding one is out of scope for this change. Verification is therefore:

1. `npx tsc --noEmit` — clean
2. `npm run build` — production build succeeds
3. Manual pass: run a workflow with no input node (expect no dialog), one with
   declared fields (expect a form), a scheduled run, and each of the three
   reworked node config sites.

The absence of automated tests around the templating grammar is a known gap and
the most valuable place to add tests later, since `lib/utils/template.ts` now has
four call sites depending on identical behavior.
