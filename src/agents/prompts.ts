import type { FailureReport } from '../core/errors.js';
import type { ReviewIssue } from '../review/issues.js';
import type { AcceptanceCriterion } from '../spec/types.js';
import type { CodeReviewInput, E2EReviewInput, PlanInput, SpecEditInput } from './claude.js';
import type { ImplementationInput } from './codex.js';

// すべての Codex 実装・修正要求に全文を含める Code Rules (§12.1)
export const CODE_RULES = `Code style:
- Implement exactly what the target Acceptance Criteria require; other behavior belongs to its own milestone.
- Use vanilla Minecraft and NeoForge mechanisms (registries, JSON resources, existing base classes) before custom code.
- Keep one direct path per behavior: small classes, direct calls, inline values until a second use appears.
- Introduce an abstraction, helper or config option only when two call sites use it now.
- Validate only states the game can produce; rely on Minecraft and NeoForge guarantees.
- Remove code, resources and comments that the current behavior no longer uses.
- Names say what the code does; comments say why, describing the current behavior only.`;

// GameTest の作成指示 (§15)
const GAMETEST_CONTRACT = `GameTest contract:
- Verify game state and logic (blocks, items, recipes, inventories, block entities, entities, saving and loading, server-side state, state changed through GUI actions) with the Minecraft/NeoForge GameTest framework of the target version.
- Each GameTest prepares the Preconditions of its Acceptance Criterion, performs the Action and asserts the Expected Result.
- The harness runs the Gradle GameTest task and reads JUnit XML reports. Configure the GameTest run so that it writes the report paths listed in tests/acceptance.json.
- Register every testcase in tests/acceptance.json under "gameTests": {"acId": "AC-F001-001", "report": "<JUnit XML path relative to the project root>", "classname": "<testcase classname in the report>", "name": "<testcase name in the report>"}. One criterion may have several testcases.
- A testcase passes only when it appears in the report and has no failure, error or skipped result.`;

// E2E シナリオの作成指示 (§16)
const E2E_CONTRACT = `E2E scenario contract:
- E2E verifies rendering in the Minecraft client: models, textures, UVs, z-fighting, clipping, transparency, GUI layout and text. Write a scenario for every target criterion whose Expected Result describes what the client displays.
- Put scenarios under tests/e2e/ and register them in tests/acceptance.json under "e2e": {"acId": "AC-F001-002", "scenario": "tests/e2e/copper-press.mjs"}. Several criteria may share one scenario.
- The harness builds the mod, deploys it, starts the NeoForge server and every MC Pilot client, waits until each client joins a fresh flat world with operator permission, runs each scenario with node from the project root, and stops everything afterwards.
- A scenario only prepares the scene, sets the camera and takes screenshots. Claude reviews the screenshots against the Expected Result:
  const { scenario, command, camera, screenshot, waitFor, mct } = await import(process.env.HARNESS_E2E_LIB);
  await scenario(async ({ clients }) => {
    const client = clients[0];
    command(client, 'setblock ~2 ~ ~ examplemod:copper_press');
    await camera(client, { x: 0.5, y: 1.6, z: -2.5, yaw: 0, pitch: 10 });
    screenshot(client, 'AC-F001-002', 'front');
  });
  command(client, text) runs a slash command as the client's operator player. camera(client, position) teleports the player to the position and rotation and waits for rendering. screenshot(client, acId, label) captures the screen for that criterion. mct(client, ...args) runs any other MC Pilot command and returns its data. waitFor(read, until, timeoutMs) polls until the observed state settles.
- Every criterion assigned to a scenario needs at least one screenshot. Prepare scenes with deterministic commands such as /setblock, /give, /summon and /item replace.`;

// Codex への実装・修正指示。Code Rules・GameTest / E2E の作成指示・失敗情報または指摘を含める (§11, §12.2)
export function implementationPrompt(input: ImplementationInput): string {
  const feedback = [
    input.failure && block(`Execution failure in ${input.failure.phase}`, failureText(input.failure)),
    input.codeIssues.length && block('Open code review issues', json(input.codeIssues.map(issueView))),
    input.e2eIssues.length && block('Open E2E review issues (the screenshots are attached)', json(input.e2eIssues.map(issueView))),
  ].filter(Boolean);
  return `You implement a NeoForge Minecraft mod. Work directly in the current project directory.

Implement milestone ${input.milestone.id} so that every target Acceptance Criterion holds. Write the Java sources, resources, GameTests, E2E scenarios and tests/acceptance.json entries the milestone needs.

Rules:
- PROJECT.md, .harness-state/ and .harness/ are read-only. Any change to them stops the harness.
- Leave all changes uncommitted. The harness creates the Git checkpoint.
- Follow the code style below in every change, including repairs.
${feedback.length ? `- Resolve every item in the feedback below with the smallest change that fixes it.
- For each review issue, add a response: "fixed" when you changed the code, or "accepted" with a reason grounded in the target Acceptance Criteria, the code style or the Minecraft/NeoForge specification when the current code is correct. A code style violation cannot be accepted.
` : ''}
${CODE_RULES}

${GAMETEST_CONTRACT}

${E2E_CONTRACT}

${block('Milestone', json(input.milestone))}

${block('Target Features and Acceptance Criteria', input.features.map(feature => feature.markdown).join('\n\n'))}

${block('Related files', input.relatedFiles.join('\n') || '(decide from the project layout)')}

${feedback.join('\n\n')}

${block('PROJECT.md', input.projectMarkdown)}

Respond with a summary of the change, the changed file paths, and one response per review issue listed above.`;
}

// Feature を milestone に割り当てる計画案を Claude に作らせる指示 (§6.2)
export function planPrompt(input: PlanInput): string {
  return `You plan the development of a NeoForge Minecraft mod. Read the project files you need.

Split the Features below into milestones:
- Assign every Feature to exactly one milestone. All Acceptance Criteria of a Feature are completed in its milestone; never split a Feature.
- A milestone may contain several Features. Put Features that share implementation into the same milestone.
- Order milestones by the dependencies between Features. Number them M01, M02, M03, ... in execution order; dependsOn lists the milestones whose results the milestone builds on.
- approach describes how the milestone is implemented. scope lists the files or areas expected to change.
- Global Requirements in PROJECT.md apply to every Feature they concern and are part of that milestone.

${block('Features', input.features.map(feature => feature.markdown).join('\n\n'))}

${block('Project files', input.projectFiles.join('\n'))}

${block('PROJECT.md', input.projectMarkdown)}`;
}

// 自然言語の製品要求を PROJECT.md に反映させる指示 (§9.6)
export function specEditPrompt(input: SpecEditInput): string {
  return `You maintain PROJECT.md, the product specification of a NeoForge Minecraft mod. Apply the change request below and return the complete updated PROJECT.md.

Format rules:
- Keep the structure: "# Project" with "Status:", "Project ID:" and "Mod ID:", then "## Platform" (Minecraft, NeoForge, Java), "## Purpose", "## Features", "## Global Requirements", "## Constraints", "## Open Questions".
- A Feature is "### F-001: Name" with "#### Description" and "#### Acceptance Criteria". Each criterion is "##### AC-F001-001: Name" with "Preconditions:", "Action:" and "Expected Result:".
- Describe behavior, display and constraints observable by players or the Minecraft server. Keep the criteria of one feature (game logic, GUI, models, textures) in that feature.
- Keep existing IDs stable and give new items the next free number.
- Keep Status as it is unless the request changes it. Status: active requires Project ID, Mod ID, all versions, at least one Feature, Acceptance Criteria for every Feature and resolved Open Questions.
- Record open product decisions in Open Questions, or write "None." when every decision is made.

${block('Change request', input.request)}

${block('Current PROJECT.md', input.projectMarkdown)}`;
}

// 初回 Code Review の指示。確認観点と Code Rules を含め、すべての指摘を列挙させる (§14.1)
export function codeReviewPrompt(input: CodeReviewInput): string {
  return `You review the implementation of milestone ${input.milestone.id} of a NeoForge Minecraft mod. Read any project file you need.

List every issue you find now. This list becomes the fixed issue set of the milestone; later reviews only check these issues, so report everything in this review.
Review for:
- Fulfilment of the target Acceptance Criteria
- Compliance with the code style below
- Appropriate use of Minecraft and NeoForge mechanisms
- Lifecycle and registration
- Client/server separation
- Saving and synchronization
- GameTests: each one prepares the Preconditions, performs the Action and asserts the Expected Result of its criterion
- Unused code, unused resources and unnecessary abstraction
For each issue give target (file and line), acId (the affected criterion, or null), problem, reason and fix. Request only changes that bring the code to the Acceptance Criteria and the code style. Return an empty list when the implementation is ready.

${CODE_RULES}

${block('Milestone', json(input.milestone))}

${block('Target Acceptance Criteria', criteriaText(input.criteria))}

${block('Changed files', input.changedFiles.join('\n'))}

${block('Git diff since the last checkpoint', input.diff)}`;
}

// Code Review の修正レビュー指示。固定済み指摘の解消状態だけを判定させ、新規指摘を禁止する (§14.2)
export function codeRecheckPrompt(input: CodeReviewInput, issues: ReviewIssue[]): string {
  return `Re-check the implementation of milestone ${input.milestone.id} of a NeoForge Minecraft mod. Read any project file you need.

Judge only the issues listed below. Return one verdict per issue ID: "resolved" when the current code fixes the problem, "open" when it is not fixed or has come back. Do not report new issues.

${block('Issues to check', json(issues.map(issueView)))}

${block('Changed files', input.changedFiles.join('\n'))}

${block('Git diff since the last checkpoint', input.diff)}`;
}

// 初回 E2E レビューの指示。screenshot と AC の Expected Result から表示上の問題を列挙させる (§17.1)
export function e2eReviewPrompt(input: E2EReviewInput): string {
  return `You review screenshots of a NeoForge Minecraft mod taken by the E2E scenarios of milestone ${input.milestone.id}. Open every screenshot with the Read tool.

Compare each screenshot with the Expected Result of its Acceptance Criterion and list every display problem you find now: missing textures, broken block, item or entity models, UV errors, z-fighting, clipping, transparency errors, broken GUI layout, text overflow and inconsistent resources. This list becomes the fixed issue set of the milestone; later reviews only check these issues.
For each issue give target (the screenshot path), acId, problem, reason and fix. Return an empty list when every screenshot shows the Expected Result.

${block('Screenshots', screenshotList(input))}

${block('Target Acceptance Criteria', criteriaText(input.criteria))}`;
}

// E2E の修正レビュー指示。固定済み指摘の解消状態だけを判定させ、新規指摘を禁止する (§17.2)
export function e2eRecheckPrompt(input: E2EReviewInput, issues: ReviewIssue[]): string {
  return `Re-check the new screenshots of milestone ${input.milestone.id} of a NeoForge Minecraft mod. Open every screenshot with the Read tool.

Judge only the issues listed below; their targets point to screenshots of an earlier run, and the new screenshots of the same criteria are listed below. Return one verdict per issue ID: "resolved" when the new screenshots no longer show the problem, "open" when they still do or it has come back. Do not report new issues.

${block('Issues to check', json(issues.map(issueView)))}

${block('New screenshots', screenshotList(input))}

${block('Target Acceptance Criteria', criteriaText(input.criteria))}`;
}

function block(title: string, body: string): string {
  return `## ${title}\n\n${body}`;
}

function json(value: unknown): string {
  return '```json\n' + JSON.stringify(value, null, 2) + '\n```';
}

function criteriaText(criteria: AcceptanceCriterion[]): string {
  return criteria.map(criterion => criterion.markdown).join('\n\n');
}

function failureText(failure: FailureReport): string {
  const files = [...failure.logs.map(file => `log: ${file}`), ...failure.screenshots.map(file => `screenshot: ${file}`)];
  return [failure.summary, failure.details && '```\n' + failure.details + '\n```', files.join('\n')].filter(Boolean).join('\n\n');
}

function screenshotList(input: E2EReviewInput): string {
  return input.scenarios.flatMap(scenario => scenario.screenshots.map(shot => `- ${shot.acId} (${shot.label}): ${shot.file}`)).join('\n');
}

function issueView(issue: ReviewIssue): object {
  return { id: issue.id, target: issue.target, acId: issue.acId, problem: issue.problem, reason: issue.reason, fix: issue.fix, history: issue.history };
}
