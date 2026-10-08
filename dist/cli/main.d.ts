#!/usr/bin/env node
export type Command = 'create' | 'init' | 'doctor' | 'preflight' | 'validate' | 'status' | 'chat' | 'plan' | 'develop' | 'server';
export declare const usage: Record<Command, string>;
export declare function main(args: string[]): Promise<void>;
export declare function reportError(error: unknown): void;
