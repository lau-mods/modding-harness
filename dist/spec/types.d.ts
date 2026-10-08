export type ProjectStatus = 'draft' | 'active';
export type ItemStatus = 'active' | 'retired';
export type Platform = {
    minecraft: string;
    neoforge: string;
    java: string;
};
export type AcceptanceCriterion = {
    id: string;
    featureId: string;
    title: string;
    status: ItemStatus;
    preconditions: string;
    action: string;
    expectedResult: string;
    markdown: string;
};
export type Requirement = {
    id: string;
    featureId: string;
    title: string;
    status: ItemStatus;
    body: string;
};
export type Feature = {
    id: string;
    title: string;
    status: ItemStatus;
    description: string;
    requirements: Requirement[];
    criteria: AcceptanceCriterion[];
};
export type CrossCuttingTopic = 'Persistence' | 'Multiplayer' | 'Visual' | 'Performance' | 'Compatibility';
export type ProjectSpec = {
    text: string;
    hash: string;
    status: ProjectStatus;
    projectId: string;
    modId: string;
    packagePath: string;
    platform: Platform;
    purpose: string;
    features: Feature[];
    crossCutting: Record<CrossCuttingTopic, string>;
    constraints: string;
    openQuestions: string;
};
