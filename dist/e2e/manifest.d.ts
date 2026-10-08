export declare const MANIFEST_FILE = "tests/e2e/manifest.json";
export type ScenarioDefinition = {
    id: string;
    acIds: string[];
    command: string[];
};
export type ScenarioManifest = {
    scenarios: ScenarioDefinition[];
};
export declare function loadManifest(root: string): Promise<ScenarioManifest>;
export declare function selectScenarios(manifest: ScenarioManifest, acIds: string[]): ScenarioDefinition[];
export declare function uncoveredCriteria(manifest: ScenarioManifest, acIds: string[]): string[];
