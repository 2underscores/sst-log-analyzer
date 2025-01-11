interface GenericStage {
    name: string,
    startTime: Date,
    endTime: Date,
    duration: number;  // in milliseconds
}

interface FunctionBuild extends GenericStage {
    functionId: string;
    buildDetails?: {
        freeMemory: string;
        totalMemory: string;
        rss: string;
        heapTotal: string;
        heapUsed: string;
        external: string;
        arrayBuffers: string;
    };
}

export interface SynthBlock extends GenericStage {
    buildConcurrency: number | null;
    deferredTasks: number | null;
    functionBuilds: FunctionBuild[];
}

export interface PublishBlock extends GenericStage {
    stackDeploys: StackDeploys[];
}

interface StackDeploys extends GenericStage {
    status: 'SKIPPED' | 'CREATE_COMPLETE' | 'UPDATE_COMPLETE';
}

interface ResourceDeploy extends GenericStage {
    resourceType: string;
    stackName: string;
}

const EVENT_TYPES = ['function.build.started', 'function.build.success', 'stack.status', 'stack.updated', 'stack.resources', 'stack.event'] as const
const EVENT_TYPES_FN_BUILD = ['function.build.started', 'function.build.success'] as const;

interface LogPublishEvent {
    type: typeof EVENT_TYPES[number];
    properties: any;
    sourceID: string;
}
interface FnBuildStartEvent extends LogPublishEvent {
    type: 'function.build.started';
    properties: {
        functionID: string;
    };
}
interface FnBuildEndEvent extends LogPublishEvent {
    type: 'function.build.success';
    properties: {
        functionID: string;
    };
}
interface StackStatusEvent extends LogPublishEvent {
    type: 'stack.status';
    properties: {
        stackID: string;
        status: string;
    };
}
interface StackEventEvent extends LogPublishEvent {
    type: 'stack.event';
    properties: {
        event: {
            LogicalResourceId: string;
            StackName: string, // "jez02-bosphorus-OpsConsolePersistence",
            ResourceType: string, //"AWS::IAM::Role",
            ResourceStatus: "CREATE_COMPLETE" | "CREATE_IN_PROGRESS",
        },
        stackID: string; // "jez02-bosphorus-OpsConsolePersistence"
    };
}

export class SSTLogAnalyzer {
    private static readonly STANDARD_LOG_PATTERN = /^(?<timestamp>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s+\+(?<timesincelastlog>\d+)ms\s+\[(?<loglevel>[A-z]+)\]\s+/
    private static readonly createLogPattern = (pattern: RegExp): RegExp => new RegExp(this.STANDARD_LOG_PATTERN.source + pattern.source);
    private static readonly SYNTH_START_PATTERN = this.createLogPattern(/Synthesizing stacks\.\.\./);
    private static readonly SYNTH_END_PATTERN = this.createLogPattern(/Finished synthesizing/); // Only in deploy logs, not build only logs
    private static readonly EVENT_PATTERN = this.createLogPattern(/Publishing event (?<event>\{.*\})/);
    private static readonly CONCURRENCY_PATTERN = this.createLogPattern(/Running (?<deferredTasks>\d+) deferred tasks with concurrency: (?<buildConcurrency>\d+)/);
    private static readonly DEPLOY_STACKS_PATTERN = this.createLogPattern(/Deploying stacks \[(?<stacks>[^\]]+)\]/);
    private static readonly FUNCTION_STATS_PATTERN = this.createLogPattern(/(?<stats>\{.*"functionID".*"handler".*\})/);

    // TODO: Change templates for properly typed build and finish stages.
    private static readonly newGenericTimeblockTemplate = { startTime: new Date(0), endTime: new Date(0), duration: 0 };
    private static readonly newSynthTemplate = () => ({
        ...this.newGenericTimeblockTemplate,
        name: 'Synthesize Stage',
        buildConcurrency: null,
        deferredTasks: null,
        functionBuilds: []
    })
    private static readonly newPublishTemplate = () => ({
        ...this.newGenericTimeblockTemplate,
        name: 'Publish Stage',
        stackDeploys: []
    })
    private static readonly newStackDeployTemplate = () => ({
        ...this.newGenericTimeblockTemplate,
        status: 'CREATE_COMPLETE' as const,
    })

    static extractSynthesizeBlocks(logContent: string): SynthBlock[] {
        const lines = logContent.split('\n');
        const synthBlocks: SynthBlock[] = [];
        let currentSynth: SynthBlock | null = null;
        let inProgressBuilds: Map<string, Partial<FunctionBuild>> = new Map();

        for (let [lineNo, line] of lines.entries()) {
            const isLastLine = (lineNo >= lines.length - 2) && !(lines[lineNo + 1]);
            const timestamp = this.extractTimestamp(line);
            if (!timestamp) continue;

            // Check for synth block start/end
            if (this.SYNTH_START_PATTERN.test(line)) {
                currentSynth = { ...this.newSynthTemplate(), startTime: timestamp };
                inProgressBuilds.clear();
                continue;
            }

            if (currentSynth && (this.SYNTH_END_PATTERN.test(line) || isLastLine)) {
                currentSynth.endTime = timestamp;
                currentSynth.duration = currentSynth.endTime.getTime() - currentSynth.startTime.getTime();
                synthBlocks.push(currentSynth);
                currentSynth = null;
                continue;
            }

            if (!currentSynth) continue;

            // Check for concurrency setting
            const concurrencyMatch = line.match(this.CONCURRENCY_PATTERN);
            if (concurrencyMatch?.groups?.buildConcurrency) {
                currentSynth.deferredTasks = parseInt(concurrencyMatch.groups.deferredTasks, 10);
                currentSynth.buildConcurrency = parseInt(concurrencyMatch.groups.buildConcurrency, 10);
                continue;
            }

            // Try to parse build events
            const event = this.extractEventPublished(line);
            if (event && this.isBuildStartEvent(event)) {
                inProgressBuilds.set(event.properties.functionID, {
                    functionId: event.properties.functionID,
                    startTime: timestamp
                });
            }
            if (event && this.isBuildSuccessEvent(event)) {
                const functionId = event.properties.functionID;
                const build = inProgressBuilds.get(functionId);
                if (build) {
                    const completeBuild: FunctionBuild = {
                        functionId: build.functionId!,
                        name: build.name || 'unknown',
                        startTime: build.startTime!,
                        endTime: timestamp,
                        duration: timestamp.getTime() - build.startTime!.getTime(),
                        buildDetails: build.buildDetails
                    };
                    currentSynth.functionBuilds.push(completeBuild);
                    inProgressBuilds.delete(functionId);
                }
            }

            // Try to parse function stats
            const stats = this.extractFunctionStats(line);
            if (stats) {
                const build = inProgressBuilds.get(stats.functionID);
                if (build) {
                    build.name = stats.handler;
                    build.buildDetails = stats;
                }
            }
        }

        return synthBlocks;
    }

    static extractPublishBlocks(logContent: string): PublishBlock[] {
        const lines = logContent.split('\n');
        const publishBlocks: PublishBlock[] = [];
        let currentPublish: PublishBlock | null = null;
        let inProgressStacks = new Map<string, StackDeploys>();
        let inProgressResources = new Map<string, ResourceDeploy>();

        for (let line of lines) {
            const timestamp = this.extractTimestamp(line);
            if (!timestamp) continue;

            // Check for new deploy block
            const deployMatch = line.match(this.DEPLOY_STACKS_PATTERN);
            if (deployMatch?.groups?.stacks) {
                currentPublish = { ...this.newPublishTemplate(), startTime: timestamp, };
                const stackNames = deployMatch.groups.stacks.split(',').map(s => s.trim().replace(/"/g, ''));
                stackNames.forEach(name => {
                    inProgressStacks.set(name, { ...this.newStackDeployTemplate(), name, });
                });
                continue;
            }

            // Look for stack status updates
            const event = this.extractEventPublished(line);
            // const event = this.extractBuildEvent(line);
            if (currentPublish && event && this.isStackStatus(event)) {
                const { stackID, status } = event.properties;
                const stack = inProgressStacks.get(stackID);
                if (!stack) {
                    console.error('Stack not found:', stackID);
                    continue;
                }

                // Set the startTime if it's the first status update for this stack
                if (stack.startTime.getTime() === 0) {
                    stack.startTime = timestamp;
                }
                // Track completion
                if (['SKIPPED', 'CREATE_COMPLETE', 'UPDATE_COMPLETE'].includes(status)) {
                    stack.endTime = timestamp;
                    stack.duration = stack.endTime.getTime() - stack.startTime.getTime();
                    stack.status = status as any;

                    // Check if this was the last stack
                    const allComplete = Array.from(inProgressStacks.values())
                        .every(s => s.endTime.getTime() > 0);

                    if (allComplete) {
                        currentPublish.endTime = timestamp;
                        currentPublish.duration = currentPublish.endTime.getTime() - currentPublish.startTime.getTime();
                        currentPublish.stackDeploys = Array.from(inProgressStacks.values());
                        publishBlocks.push(currentPublish);

                        currentPublish = null;
                        inProgressStacks.clear();
                    }
                } else {
                    // console.log('Unhandled stack status:', status);
                }
            }
        }
        return publishBlocks;
    }

    // At a resource level extract all resources and when they started and ended deployment
    static extractResourceBlocks(logContent: string): ResourceDeploy[] {
        const lines = logContent.split('\n');
        let inProgressResources = new Map<string, ResourceDeploy>();
        const resources: ResourceDeploy[] = [];

        for (let line of lines) {
            const timestamp = this.extractTimestamp(line);
            if (!timestamp) continue;
            const event = this.extractEventPublished(line);
            if (!event || !this.isStackEvent(event)) continue;

            const resourceId = event.properties.event.LogicalResourceId;
            const status = event.properties.event.ResourceStatus;
            const resource = inProgressResources.get(resourceId);
            if (!resource && status === 'CREATE_IN_PROGRESS') {
                inProgressResources.set(resourceId, {
                    ...this.newGenericTimeblockTemplate,
                    name: resourceId,
                    startTime: timestamp,
                    resourceType: event.properties.event.ResourceType,
                    stackName: event.properties.event.StackName,
                });
            } else if (resource && status === 'CREATE_IN_PROGRESS') {
                // console.log('Resource already in progress:', resourceId);
                () => { };
            } else if (resource && status === 'CREATE_COMPLETE') {
                resource.endTime = timestamp;
                resource.duration = resource.endTime.getTime() - resource.startTime.getTime();
                resources.push(resource);
            } else if (!resource && status === 'CREATE_COMPLETE') {
                if (event.properties.event.ResourceType !== 'AWS::CloudFormation::Stack') {
                    console.log({ resource, status, event, line });
                    throw new Error('Unhandled resource status');
                }
            }
        }
        return resources;
    }

    private static extractTimestamp(line: string): Date | null {
        const match = line.match(this.STANDARD_LOG_PATTERN);
        return match?.groups?.timestamp ? new Date(match.groups.timestamp) : null;
    }

    private static extractEventPublished(line: string): LogPublishEvent | null {
        // Parse out JSON event from log
        const match = line.match(this.EVENT_PATTERN);
        const eventStr = match?.groups?.event || '';
        if (!match) { return null; }
        if (match && !eventStr) { throw new Error('Regex event match but unable get event string: ' + line); }
        const event = JSON.parse(eventStr);
        // Throw if it doesn't fit expected structure
        if (EVENT_TYPES.includes(event.type) && event.properties && event.sourceID) {
            return event;
        } else {
            throw new Error('Event does not match expected structure: ' + line);
        }
    }
    private static isBuildStartEvent(event: LogPublishEvent): event is FnBuildStartEvent {
        return event.type === 'function.build.started';
    }
    private static isBuildSuccessEvent(event: LogPublishEvent): event is FnBuildEndEvent {
        return event.type === 'function.build.success';
    }
    private static isStackEvent(event: LogPublishEvent): event is StackEventEvent {
        return event.type === 'stack.event';
    }
    private static isStackStatus(event: LogPublishEvent): event is StackStatusEvent {
        return event.type === 'stack.status';
    }

    private static extractFunctionStats(line: string): any {
        try {
            const match = line.match(this.FUNCTION_STATS_PATTERN);
            if (!match?.groups?.stats) { return null };
            const statsJson = match.groups.stats;
            const stats = JSON.parse(statsJson);
            return stats;
        } catch (error) {
            console.error('Failed to parse function stats:', line, error);
            return null;
        }
    }
}