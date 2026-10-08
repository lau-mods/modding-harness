import { loadConfig } from '../config/config.js';
import { checkActivation, checkStructure } from '../spec/check.js';
import { readProject } from '../spec/parser.js';
// PROJECT.md の構造・active 条件と .harness-config.json を検査する (§25)
export async function validateProject(root) {
    const problems = [];
    const config = await loadConfig(root).catch((error) => { problems.push(error.message); return null; });
    const spec = await readProject(root).catch((error) => { problems.push(error.message); return null; });
    if (spec) {
        problems.push(...checkStructure(spec));
        if (spec.status === 'active')
            problems.push(...checkActivation(spec));
    }
    return { spec, config, problems };
}
//# sourceMappingURL=validate.js.map