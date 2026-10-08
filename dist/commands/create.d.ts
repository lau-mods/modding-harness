export type CreateOptions = {
    templateRepo: string;
    templateRef?: string;
};
export declare function createProject(directory: string, options: CreateOptions): Promise<void>;
