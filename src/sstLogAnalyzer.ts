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

interface SynthBlock extends GenericStage {
    buildConcurrency: number | null;
    deferredTasks: number | null;
    functionBuilds: FunctionBuild[];
}

interface PublishBlock extends GenericStage {
    stackDeploys: StackDeploys[];
}

interface StackDeploys extends GenericStage {
    status: 'SKIPPED' | 'CREATE_COMPLETE' | 'UPDATE_COMPLETE';
}

interface ResourceDeploy extends GenericStage {
    resourceType: string;
    stackName: string;
}

const eventTypes = ['function.build.started', 'function.build.success', 'stack.status', 'stack.updated', 'stack.resources', 'stack.event', 'file.changed', 'cli.dev', 'stacks.metadata.updated'] as const
const stackStatuses = ['PUBLISH_ASSETS_IN_PROGRESS', 'CREATE_IN_PROGRESS', 'UPDATE_IN_PROGRESS', 'SKIPPED', 'CREATE_COMPLETE', 'UPDATE_COMPLETE', 'ROLLBACK_IN_PROGRESS'] as const
type EventTypes = typeof eventTypes[number];
type StackStatuses = typeof stackStatuses[number];

interface LogPublishEvent {
    type: EventTypes;
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
        status: StackStatuses;
    };
}
interface StackEventEvent extends LogPublishEvent {
    type: 'stack.event';
    properties: {
        event: {
            LogicalResourceId: string;
            StackName: string, // "jez02-bosphorus-OpsConsolePersistence",
            ResourceType: string, //"AWS::IAM::Role",
            ResourceStatus: StackStatuses,
        },
        stackID: string; // "jez02-bosphorus-OpsConsolePersistence"
    };
}

// Regexes to identify types of log lines and extract high level data log data
const STANDARD_LOG_PATTERN = /^(?<timestamp>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s+\+(?<timesincelastlog>\d+)ms\s+\[(?<loglevel>[A-z]+)\]\s+/
const createLogPattern = (pattern: RegExp): RegExp => new RegExp(STANDARD_LOG_PATTERN.source + pattern.source);
const regexes = {
    standardLog: STANDARD_LOG_PATTERN,
    synthStartPattern: createLogPattern(/Synthesizing stacks\.\.\./),
    synthEndPattern: createLogPattern(/Finished synthesizing/), // Only in deploy logs, not build only logs
    eventPattern: createLogPattern(/Publishing event (?<event>\{.*\})/),
    concurrencyPattern: createLogPattern(/Running (?<deferredTasks>\d+) deferred tasks with concurrency: (?<buildConcurrency>\d+)/),
    deployStacksPattern: createLogPattern(/Deploying stacks \[(?<stacks>[^\]]+)\]/),
    functionStatsPattern: createLogPattern(/(?<stats>\{.*"functionID".*"handler".*\})/),
} as const
function extractTimestamp(line: string): Date | null {
    const match = line.match(regexes.standardLog);
    return match?.groups?.timestamp ? new Date(match.groups.timestamp) : null;
}

// Extraction functions to pull out SST JSON event if it exists
function extractEventPublished(line: string): LogPublishEvent | null {
    // Parse out JSON event from log
    const match = line.match(regexes.eventPattern);
    const eventStr = match?.groups?.event || '';
    if (!match) { return null; }
    if (match && !eventStr) { throw new Error('Regex event match but unable get event string: ' + line); }
    const event = JSON.parse(eventStr);
    // Throw if it doesn't fit expected structure
    if (eventTypes.includes(event.type) && event.properties && event.sourceID) {
        return event;
    } else {
        if (event.type === 'stacks.metadata.updated') {
            return null; // Ignore event, has no props
        }
        const devModeEvents = ['function.invoked', 'function.ack', 'function.success', 'local.patches', 'worker.started', 'worker.stdout']
        if (devModeEvents.includes(event.type)) {
            return null; // Ignore event, dev mode specific
        }
        throw new Error('Event does not match expected structure: ' + line);
    }
}
function isBuildStartEvent(event: LogPublishEvent): event is FnBuildStartEvent {
    return event.type === 'function.build.started';
}
function isBuildSuccessEvent(event: LogPublishEvent): event is FnBuildEndEvent {
    return event.type === 'function.build.success';
}
function isStackEvent(event: LogPublishEvent): event is StackEventEvent {
    return event.type === 'stack.event';
}
function isStackStatus(event: LogPublishEvent): event is StackStatusEvent {
    return event.type === 'stack.status';
}

function extractFunctionStats(line: string): any {
    try {
        const match = line.match(regexes.functionStatsPattern);
        if (!match?.groups?.stats) { return null };
        const statsJson = match.groups.stats;
        const stats = JSON.parse(statsJson);
        return stats;
    } catch (error) {
        console.error('Failed to parse function stats:', line, error);
        return null;
    }
}

export function extractSynthesizeBlocks(logContent: string): SynthBlock[] {
    const lines = logContent.split('\n');
    const synthBlocks: SynthBlock[] = [];
    let currentSynth: SynthBlock | null = null;
    let inProgressBuilds: Map<string, Partial<FunctionBuild>> = new Map();

    for (let [lineNo, line] of lines.entries()) {
        const isLastLine = (lineNo >= lines.length - 2) && !(lines[lineNo + 1]);
        const timestamp = extractTimestamp(line);
        if (!timestamp) continue;

        // Check for synth block start/end
        if (regexes.synthStartPattern.test(line)) {
            currentSynth = {
                startTime: timestamp,
                endTime: new Date(0),
                duration: 0,
                name: 'Synthesize Stage',
                buildConcurrency: null,
                deferredTasks: null,
                functionBuilds: [],
            };
            inProgressBuilds.clear();
            continue;
        }
        if (currentSynth && (regexes.synthEndPattern.test(line) || isLastLine)) {
            currentSynth.endTime = timestamp;
            currentSynth.duration = currentSynth.endTime.getTime() - currentSynth.startTime.getTime();
            synthBlocks.push(currentSynth);
            currentSynth = null;
            continue;
        }
        if (!currentSynth) continue;

        // Check for concurrency setting
        const concurrencyMatch = line.match(regexes.concurrencyPattern);
        if (concurrencyMatch?.groups?.buildConcurrency) {
            currentSynth.deferredTasks = parseInt(concurrencyMatch.groups.deferredTasks, 10);
            currentSynth.buildConcurrency = parseInt(concurrencyMatch.groups.buildConcurrency, 10);
            continue;
        }
        // Try to parse build events
        const event = extractEventPublished(line);
        if (event && isBuildStartEvent(event)) {
            inProgressBuilds.set(event.properties.functionID, {
                functionId: event.properties.functionID,
                startTime: timestamp
            });
        }
        if (event && isBuildSuccessEvent(event)) {
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
        const stats = extractFunctionStats(line);
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

export function extractPublishBlocks(logContent: string): PublishBlock[] {
    const lines = logContent.split('\n');
    const publishBlocks: PublishBlock[] = [];
    let currentPublish: PublishBlock | undefined = undefined;
    let inProgressStacks = new Map<string, StackDeploys>();

    let maxTimestamp = new Date(0);
    for (let line of lines) {
        const timestamp = extractTimestamp(line);
        if (!timestamp) continue;
        maxTimestamp = timestamp > maxTimestamp ? timestamp : maxTimestamp;

        // If this is start of new deploy block, start tracking it
        const deployMatch = line.match(regexes.deployStacksPattern);
        if (deployMatch?.groups?.stacks) {
            console.log('New deploy block:', deployMatch.groups.stacks);
            const stackNames = deployMatch.groups.stacks.split(',').map(s => s.trim().replace(/"/g, ''));
            currentPublish = {
                startTime: timestamp,
                endTime: new Date(0),
                duration: 0,
                name: 'Publish Stage',
                stackDeploys: [],
            };
            stackNames.forEach(name => {
                inProgressStacks.set(name, {
                    startTime: new Date(0),
                    endTime: new Date(0),
                    duration: 0,
                    status: 'CREATE_COMPLETE' as const,
                    name,
                }
                );
            });
            continue;
        }
        // Look for stack status updates
        const event = extractEventPublished(line);
        if (currentPublish && event && isStackStatus(event)) {
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
            const completionStatuses: StackStatuses[] = ['SKIPPED', 'CREATE_COMPLETE', 'UPDATE_COMPLETE', 'ROLLBACK_IN_PROGRESS']
            if (completionStatuses.includes(status)) {
                stack.endTime = timestamp;
                stack.duration = stack.endTime.getTime() - stack.startTime.getTime();
                stack.status = status as any;
                // If this was final stack, update it. 
                const allComplete = Array.from(inProgressStacks.values())
                    .every(s => s.endTime.getTime() > 0);
                if (allComplete) {
                    currentPublish.endTime = timestamp;
                    currentPublish.duration = currentPublish.endTime.getTime() - currentPublish.startTime.getTime();
                    currentPublish.stackDeploys = Array.from(inProgressStacks.values());
                    publishBlocks.push(currentPublish);
                    currentPublish = undefined;
                    inProgressStacks.clear();
                }
            } else {
                console.log('Unhandled stack status:', status);
            }
        }
    }
    if (currentPublish) {
        console.error('Publish block did not complete:', currentPublish);
        currentPublish.endTime = maxTimestamp;
        currentPublish.duration = currentPublish.endTime.getTime() - currentPublish.startTime.getTime();
        inProgressStacks.forEach(s => {
            if (s.endTime <= currentPublish!.startTime) s.endTime = maxTimestamp
            if (s.startTime <= currentPublish!.startTime) s.startTime = currentPublish!.endTime;
            s.duration = s.endTime.getTime() - s.startTime.getTime();
        });
        currentPublish.stackDeploys = Array.from(inProgressStacks.values());
        publishBlocks.push(currentPublish);
    }
    return publishBlocks;
}

// At a resource level extract all resources and when they started and ended deployment
export function extractResourceBlocks(logContent: string): ResourceDeploy[] {
    const lines = logContent.split('\n');
    let inProgressResources = new Map<string, ResourceDeploy>();
    const resources: ResourceDeploy[] = [];

    for (let line of lines) {
        const timestamp = extractTimestamp(line);
        if (!timestamp) continue;
        const event = extractEventPublished(line);
        if (!event || !isStackEvent(event)) continue;
        const resourceId = event.properties.event.LogicalResourceId;
        const status = event.properties.event.ResourceStatus;
        const resource = inProgressResources.get(resourceId);
        // Complete resource
        if (!resource && (status === 'CREATE_IN_PROGRESS' || status === 'UPDATE_IN_PROGRESS')) {
            inProgressResources.set(resourceId, {
                startTime: timestamp,
                endTime: new Date(0),
                duration: 0,
                name: resourceId,
                resourceType: event.properties.event.ResourceType,
                stackName: event.properties.event.StackName,
            });
        // If completion log, complete resource
        } else if (resource && (status === 'CREATE_COMPLETE' || status === 'UPDATE_COMPLETE')) {
            resource.endTime = timestamp;
            resource.duration = resource.endTime.getTime() - resource.startTime.getTime();
            resources.push(resource);
        // Completion log, but no pre-existing resource (shouldn't happen)
        } else if (!resource && (status === 'CREATE_COMPLETE' || status === 'UPDATE_COMPLETE')) {
            if (event.properties.event.ResourceType !== 'AWS::CloudFormation::Stack') {
                console.error({ message: 'Unhandled resource status. Finish found without a start.', resource, status, event, line });
            }
        }
    }
    return resources;
}