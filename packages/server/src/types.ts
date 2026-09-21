import type { Flow, RunState } from '@arcsig-labs/core';

export interface FlowRecord {
	id: string;
	name: string;
	flow: Flow;
	/** Only active flows respond to webhooks and schedules. */
	active: boolean;
	/** Increases on every save. */
	version: number;
	createdAt: number;
	updatedAt: number;
}

export type RunTrigger =
	| { type: 'api' }
	| { type: 'webhook'; method: string; path: string }
	| { type: 'schedule'; nodeId: string; at: number };

export interface RunRecord {
	id: string;
	flowId: string;
	flowVersion: number;
	/** The flow as it was when the run started; resumes use this copy. */
	flow: Flow;
	trigger: RunTrigger;
	status: RunState['status'];
	state: RunState;
	/** Earliest time a waiting timer step is due. */
	wakeAt?: number;
	startedAt: number;
	updatedAt: number;
	finishedAt?: number;
}

export interface CredentialRecord {
	id: string;
	name: string;
	/** Matches the `type` of `f.credential(type)` fields, e.g. "http-auth". */
	type: string;
	/** Encrypted value. */
	secret: string;
	createdAt: number;
	updatedAt: number;
}

export interface ListRunsQuery {
	flowId?: string;
	status?: RunState['status'];
	/** Only runs that started before this time (for paging). */
	before?: number;
	limit?: number;
}

/** Where flows, runs and credentials live. Implement it for your database. */
export interface Storage {
	getFlow(id: string): Promise<FlowRecord | undefined>;
	listFlows(): Promise<FlowRecord[]>;
	saveFlow(record: FlowRecord): Promise<void>;
	deleteFlow(id: string): Promise<void>;

	getRun(id: string): Promise<RunRecord | undefined>;
	/** Newest first. */
	listRuns(query?: ListRunsQuery): Promise<RunRecord[]>;
	saveRun(record: RunRecord): Promise<void>;
	/** Waiting runs whose `wakeAt` is at or before `now`. */
	dueRuns(now: number): Promise<RunRecord[]>;

	getCredential(id: string): Promise<CredentialRecord | undefined>;
	listCredentials(): Promise<CredentialRecord[]>;
	saveCredential(record: CredentialRecord): Promise<void>;
	deleteCredential(id: string): Promise<void>;
}
