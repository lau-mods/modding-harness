import { FatalError } from '../core/errors.js';
// ID 形式・一意性・Feature との親子関係・AC 必須項目など構造上の問題を列挙する (§3, §5)
export function checkStructure(spec) {
    const problems = [];
    const seen = new Set();
    const unique = (id) => {
        if (seen.has(id))
            problems.push(`Duplicate ID: ${id}`);
        seen.add(id);
    };
    for (const feature of spec.features) {
        unique(feature.id);
        const number = feature.id.match(/^F-(\d{3})$/)?.[1];
        if (!number) {
            problems.push(`Invalid Feature ID: ${feature.id} (expected F-001)`);
            continue;
        }
        for (const [prefix, items] of [['R', feature.requirements], ['AC', feature.criteria]]) {
            for (const item of items) {
                unique(item.id);
                if (!new RegExp(`^${prefix}-F${number}-\\d{3}$`).test(item.id))
                    problems.push(`Invalid ID under ${feature.id}: ${item.id} (expected ${prefix}-F${number}-001)`);
            }
        }
        for (const criterion of feature.criteria.filter(ac => ac.status === 'active')) {
            for (const [name, value] of [['Preconditions', criterion.preconditions], ['Action', criterion.action], ['Expected Result', criterion.expectedResult]]) {
                if (!value)
                    problems.push(`${criterion.id} requires ${name}`);
            }
        }
    }
    return problems;
}
// Status: active の条件 (ID・version 確定、active AC の存在、Open Questions 解消) を満たさない項目を列挙する (§4)
export function checkActivation(spec) {
    const problems = [];
    const required = [
        ['Project ID', spec.projectId], ['Mod ID', spec.modId],
        ['Minecraft version', spec.platform.minecraft], ['NeoForge version', spec.platform.neoforge], ['Java version', spec.platform.java],
    ];
    for (const [name, value] of required)
        if (!value)
            problems.push(`${name} is required`);
    if (!activeCriteria(spec).length)
        problems.push('At least one active Acceptance Criterion is required');
    if (spec.openQuestions !== 'None.')
        problems.push('Open Questions must be resolved (write "None.")');
    return problems;
}
// 計画・開発できる仕様 (active かつ構造上の問題なし) であることを確認する。違反時は FatalError (§20)
export function requireActionable(spec) {
    if (spec.status !== 'active')
        throw new FatalError('PROJECT.md Status must be active before planning or development');
    const problems = [...checkStructure(spec), ...checkActivation(spec)];
    if (problems.length)
        throw new FatalError(`PROJECT.md is incomplete:\n- ${problems.join('\n- ')}`);
}
// retired の Feature / AC を除いた active な AC を返す
export function activeCriteria(spec) {
    return spec.features.flatMap(feature => feature.criteria).filter(criterion => criterion.status === 'active');
}
// ID から AC を引く
export function findCriterion(spec, id) {
    return spec.features.flatMap(feature => feature.criteria).find(criterion => criterion.id === id);
}
//# sourceMappingURL=check.js.map