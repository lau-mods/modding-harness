import type { ReviewIssue } from '../review/issues.js';
import type { AcceptanceCriterion } from '../spec/types.js';
import type { CodeReviewInput, PlanInput, SpecEditInput, VisualReviewInput } from './claude.js';
import type { ImplementationInput } from './codex.js';

// 実装・修正依頼の prompt。PROJECT.md と Harness 本体の変更禁止を明示する (§8)
export function implementationPrompt(input: ImplementationInput): string {
  const feedback = [
    input.buildFailure && block(`Build failure (${input.buildFailure.step})`, input.buildFailure.summary),
    input.codeIssues.length && block('Unresolved code review issues', json(input.codeIssues.map(issueView))),
    input.visualIssues.length && block('Unresolved visual review issues', json(input.visualIssues.map(issueView))),
    input.e2eFailure && block('E2E failure', json(input.e2eFailure)),
  ].filter(Boolean);
  return `You are the implementer of a NeoForge Minecraft mod. Work directly in the current project directory.

Implement milestone ${input.milestone.id} so that every target Acceptance Criterion holds in a real Minecraft server and client.
Edit source, resources, build configuration and E2E scenarios as needed.

Rules:
- PROJECT.md and the harness installation are read-only during implementation. Any change to them stops the harness.
- Leave all changes uncommitted. The harness creates the Git checkpoint.
${feedback.length ? `- Address every item in the feedback below with the smallest change that resolves it, keeping the surrounding code as it is. For each review issue, add a response: "fixed" when you changed the code, or "accepted" with a concrete reason when the current code is correct as it is.\n` : ''}
${CODE_STYLE}

${SCENARIO_CONTRACT}

${block('Milestone', json(input.milestone))}

${block('Target Acceptance Criteria', criteriaText(input.criteria))}

${block('Related files', input.relatedFiles.join('\n') || '(decide from the project layout)')}

${feedback.join('\n\n')}

${block('PROJECT.md', input.projectMarkdown)}

Respond with a summary of the change, the changed file paths, and one response per review issue listed above.`;
}

// 計画作成の prompt (§6)
export function planPrompt(input: PlanInput): string {
  return `You plan the development of a NeoForge Minecraft mod. Read the project files you need.

Split the work into milestones:
- Assign every active Acceptance Criterion below to exactly one milestone.
- Group criteria into one milestone when a single implementation verifies them together naturally.
- Number milestones M01, M02, M03, ... in execution order. dependsOn lists earlier milestones only.
- summary describes what the milestone implements, scope lists the files or areas expected to change, e2eSummary describes how the Minecraft E2E scenarios verify the criteria.

${block('Active Acceptance Criteria', criteriaText(input.criteria))}

${block('Project files', input.projectFiles.join('\n'))}

${block('PROJECT.md', input.projectMarkdown)}`;
}

// 仕様変更の prompt。PROJECT.md の形式と ID 規則を守らせる (§3, §5, §23)
export function specEditPrompt(input: SpecEditInput): string {
  return `You maintain PROJECT.md, the product specification of a NeoForge Minecraft mod. Apply the change request below and return the complete updated PROJECT.md.

Format rules:
- Keep the existing section structure: "# Project" header fields (Status, Project ID, Mod ID, Package Path), "## Platform", "## Purpose", "## Features", "## Cross-cutting Requirements" with its five subsections, "## Constraints", "## Open Questions".
- Features use "### F-001: Name" with "#### Description", "#### Requirements" ("##### R-F001-001: Name") and "#### Acceptance Criteria" ("##### AC-F001-001: Name").
- Every Acceptance Criterion has "Preconditions:", "Action:" and "Expected Result:". The Expected Result is a concrete outcome observable in a real Minecraft E2E run.
- Describe behavior observable by players or the Minecraft server/client. Keep existing IDs stable and give new items the next free number.
- To retire an item, add "Status: retired" below its heading.
- Record genuinely open product decisions in Open Questions, or write "None." when every decision is made.

${block('Change request', input.request)}

${block('Current PROJECT.md', input.projectMarkdown)}`;
}

// 初回コードレビューの prompt。NeoForge API・client/server・registration 等の観点を含める (§10)
export function codeReviewPrompt(input: CodeReviewInput): string {
  return `You review the implementation of milestone ${input.milestone.id} of a NeoForge Minecraft mod. Read any project file you need.

List every issue you can find now. This list becomes the fixed issue set for the milestone, and later reviews only check these issues.
Review for:
- Fulfilment of the target Acceptance Criteria and the milestone goal
- NeoForge API usage, client/server separation, registration, networking, serialization and state synchronization
- E2E scenarios: they observe real game state for every Acceptance Criterion and follow the scenario contract
- Violations of the code style below, including code that the current behavior leaves unused
Report concrete problems with the required change. Request changes that bring the code to the Acceptance Criteria and the code style; extra defensive code and generality are outside the review goal. Return an empty list when the implementation is ready.

${CODE_STYLE}

${SCENARIO_CONTRACT}

${block('Milestone', json(input.milestone))}

${block('Target Acceptance Criteria', criteriaText(input.criteria))}

${block('Changed files', input.changedFiles.join('\n'))}

${block('E2E scenario files', input.scenarioFiles.join('\n') || '(none changed)')}

${block('Git diff since the last checkpoint', input.diff)}`;
}

// コード再レビューの prompt。初回指摘の解消状態だけを判定させる (§10)
export function codeRecheckPrompt(input: CodeReviewInput, issues: ReviewIssue[]): string {
  return `Re-check the implementation of milestone ${input.milestone.id}. Judge only the issues listed below: return "resolved" or "unresolved" with a short note for each issue ID. Read any project file you need.

${block('Issues to check', json(issues.map(issueView)))}

${block('Changed files', input.changedFiles.join('\n'))}

${block('Git diff since the last checkpoint', input.diff)}`;
}

// 初回画面確認の prompt (§15)
export function visualReviewPrompt(input: VisualReviewInput): string {
  return `You review screenshots taken by the Minecraft E2E scenarios of milestone ${input.milestone.id}. Open each screenshot with the Read tool.

List every visual problem you can find now: block and item models, textures, GUI layout, text, animation, transparency, clipping and displayed state, compared with the Expected Results below. This list becomes the fixed visual issue set for the milestone. Return an empty list when everything looks correct.

${block('Screenshots', input.screenshots.join('\n'))}

${block('Target Acceptance Criteria', criteriaText(input.criteria))}

${block('Scenario results', json(input.results))}`;
}

// 画面再確認の prompt。初回指摘の解消状態だけを判定させる (§15)
export function visualRecheckPrompt(input: VisualReviewInput, issues: ReviewIssue[]): string {
  return `Re-check the new screenshots of milestone ${input.milestone.id}. Open each screenshot with the Read tool. Judge only the visual issues listed below: return "resolved" or "unresolved" with a short note for each issue ID.

${block('Issues to check', json(issues.map(issueView)))}

${block('Screenshots', input.screenshots.join('\n'))}`;
}

const CODE_STYLE = `Code style:
- Implement exactly what the target Acceptance Criteria require; other behavior belongs to its own milestone.
- Use vanilla Minecraft and NeoForge mechanisms (registries, JSON resources, existing base classes) before custom code.
- Keep one direct path per behavior: small classes, direct calls, inline values until a second use appears.
- Introduce an abstraction, helper or config option only when two call sites use it now.
- Validate only states the game can produce; rely on Minecraft and NeoForge guarantees.
- Remove code, resources and comments that the current behavior no longer uses.
- Names say what the code does; comments say why, describing the current behavior only.`;

const SCENARIO_CONTRACT = `E2E scenario contract:
- tests/e2e/manifest.json registers scenarios: {"scenarios":[{"id":"press","acIds":["AC-F001-001"],"command":["node","tests/e2e/scenarios/press.mjs"]}]}. Every target Acceptance Criterion needs at least one scenario.
- The harness builds the mod, deploys the jar to the server and every client, starts the NeoForge server, launches every client in HARNESS_CLIENTS and waits until each one has joined the world, runs each scenario command from the project root, and stops all clients and the server afterwards.
- Environment variables: HARNESS_MCT (MC Pilot command), MCT_HOME and MCT_CACHE_DIR (MC Pilot home, already set), HARNESS_CLIENTS (JSON array of client names), HARNESS_SERVER_ADDRESS, HARNESS_WORLD, HARNESS_SERVER_CONTROL (JSON argv; append "stop" or "start" to restart the server and clients, for example to reload the world), HARNESS_RESULT_FILE, HARNESS_SCREENSHOT_DIR, HARNESS_SCENARIO_ID, HARNESS_AC_IDS (JSON array).
- A scenario drives the game through the connected clients with MC Pilot commands. Every MC Pilot command prints a JSON envelope {"success":true,"data":...}. With several clients running, pass the global option "--client <name>" before the subcommand.
- Gameplay commands wrap the client response in a second envelope: {"success":true,"data":{"success":true,"data":{...}}}. Read game state from the inner data after both success flags are true; lifecycle commands such as client launch use a single envelope.
- A scenario observes real game state and writes HARNESS_RESULT_FILE: {"scenarioId":"press","passed":true,"assertions":[{"name":"output_created","expected":1,"actual":1,"passed":true}],"screenshots":["output.png"]}. Each assertion compares an observed value with the Expected Result.
- When an Expected Result includes visual content, the scenario saves screenshots with "$HARNESS_MCT screenshot --output $HARNESS_SCREENSHOT_DIR/<name>.png" and lists the file names in "screenshots".
- A scenario exits with code 0 after writing the result file, also when assertions fail. A non-zero exit code means the scenario itself could not run.`;

function block(title: string, body: string): string {
  return `## ${title}\n\n${body}`;
}

function json(value: unknown): string {
  return '```json\n' + JSON.stringify(value, null, 2) + '\n```';
}

function criteriaText(criteria: AcceptanceCriterion[]): string {
  return criteria.map(criterion => criterion.markdown).join('\n\n');
}

function issueView(issue: ReviewIssue): object {
  return { id: issue.id, title: issue.title, detail: issue.detail, file: issue.file, line: issue.line, history: issue.history };
}
