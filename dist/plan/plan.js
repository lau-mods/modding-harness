import { FatalError } from '../core/errors.js';
import { exists, readJson, writeAtomic } from '../core/fs.js';
import { projectPaths } from '../core/paths.js';
import { activeCriteria } from '../spec/check.js';
// 保存済みの計画を読む。存在しなければ null、読めなければ FatalError (§20)
export async function loadPlan(root) {
    const file = projectPaths(root).plan;
    if (!await exists(file))
        return null;
    try {
        return await readJson(file);
    }
    catch (error) {
        throw new FatalError(`Cannot read the implementation plan: ${error.message}`);
    }
}
// 計画を保存する
export async function savePlan(root, plan) {
    await writeAtomic(projectPaths(root).plan, plan);
}
// 除外分を除く全 active AC がちょうど 1 つの milestone に割り当てられ、依存が先行していることなどを検査して問題を列挙する (§6)
export function checkPlan(plan, spec) {
    const problems = [];
    if (plan.specHash !== spec.hash)
        problems.push('Plan was created for a different PROJECT.md');
    if (!plan.milestones.length)
        problems.push('Plan requires at least one milestone');
    const active = new Set(activeCriteria(spec).map(criterion => criterion.id));
    const assigned = new Set();
    plan.milestones.forEach((milestone, index) => {
        if (milestone.id !== milestoneId(index))
            problems.push(`Milestone ${index + 1} must have ID ${milestoneId(index)} (got ${milestone.id})`);
        if (!milestone.acIds.length)
            problems.push(`${milestone.id} has no Acceptance Criteria`);
        for (const id of milestone.acIds) {
            if (!active.has(id))
                problems.push(`${milestone.id} references an unknown or retired AC: ${id}`);
            if (assigned.has(id))
                problems.push(`${id} is assigned to more than one milestone`);
            assigned.add(id);
        }
        for (const dependency of milestone.dependsOn) {
            if (!plan.milestones.slice(0, index).some(previous => previous.id === dependency))
                problems.push(`${milestone.id} depends on ${dependency}, which must come earlier`);
        }
    });
    for (const { acId } of plan.excluded)
        assigned.add(acId);
    for (const id of active)
        if (!assigned.has(id))
            problems.push(`${id} is assigned to no milestone`);
    return problems;
}
// 0 始まりの index から M01 形式の milestone ID を作る (§6)
export function milestoneId(index) {
    return `M${String(index + 1).padStart(2, '0')}`;
}
// checkpoint 済みでない最初の milestone を返す。全て完了していれば null
export function nextMilestone(plan, checkpoints) {
    return plan.milestones.find(milestone => !checkpoints.some(checkpoint => checkpoint.milestone === milestone.id)) ?? null;
}
//# sourceMappingURL=plan.js.map