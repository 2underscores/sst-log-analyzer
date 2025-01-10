interface FunctionBuild {
    functionId: string;
    handler: string;
    startTime: Date;
    endTime: Date;
    duration: number;  // in milliseconds
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

export interface SynthBlock {
    startTime: Date;
    endTime: Date;
    duration: number;
    buildConcurrency: number | null;
    deferredTasks: number | null;
    functionBuilds: FunctionBuild[];
}

interface BuildEvent {
    type: string;
    properties: {
        functionID: string;
    };
    sourceID: string;
}

export interface PublishBlock {
    startTime: Date;
    endTime: Date;
    duration: number;
    stackDeploys: StackDeploys[];
}

interface StackDeploys {
    name: string;
    startTime: Date;
    endTime: Date;
    duration: number;
    status: 'SKIPPED' | 'CREATE_COMPLETE' | 'UPDATE_COMPLETE';
    stages: Array<{
        status: 'PUBLISH_ASSETS_IN_PROGRESS' | 'CREATE_IN_PROGRESS' | 'UPDATE_IN_PROGRESS' | 'SKIPPED' | 'CREATE_COMPLETE' | 'UPDATE_COMPLETE';
        timestamp: Date;
    }>;
}

export class SSTLogAnalyzer {
    private static readonly SYNTH_START_PATTERN = /Synthesizing stacks\.\.\./;
    private static readonly SYNTH_END_PATTERN = /Finished synthesizing/;
    private static readonly TIMESTAMP_PATTERN = /^(?<timestamp>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/;
    private static readonly EVENT_PATTERN = /Publishing event (?<event>\{.*\})/;
    private static readonly FUNCTION_STATS_PATTERN = /\[debug\] (?<stats>\{.*"functionID".*"handler".*\})/;
    private static readonly CONCURRENCY_PATTERN = /Running (?<deferredTasks>\d+) deferred tasks with concurrency: (?<buildConcurrency>\d+)/;
    private static readonly DEPLOY_STACKS_PATTERN = /Deploying stacks \[(?<stacks>[^\]]+)\]/;
    private static readonly STACK_STATUS_PATTERN = /"type":"stack\.status".*"stackID":"(?<stackName>[^"]+)".*"status":"(?<status>[^"]+)"/;

    static extractSynthesizeBlocks(logContent: string): SynthBlock[] {
        const lines = logContent.split('\n');
        const synthBlocks: SynthBlock[] = [];
        let currentSynth: SynthBlock | null = null;
        let inProgressBuilds: Map<string, Partial<FunctionBuild>> = new Map();

        for (let line of lines) {
            const timestamp = this.extractTimestamp(line);
            if (!timestamp) continue;

            // Check for synth block start/end
            if (this.SYNTH_START_PATTERN.test(line)) {
                currentSynth = {
                    startTime: timestamp,
                    endTime: new Date(0),
                    duration: 0,
                    buildConcurrency: null,
                    deferredTasks: null,
                    functionBuilds: []
                };
                inProgressBuilds.clear();
                continue;
            }

            if (currentSynth && this.SYNTH_END_PATTERN.test(line)) {
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
            const event = this.extractBuildEvent(line);
            if (event) {
                if (event.type === 'function.build.started') {
                    inProgressBuilds.set(event.properties.functionID, {
                        functionId: event.properties.functionID,
                        startTime: timestamp
                    });
                } else if (event.type === 'function.build.success') {
                    const functionId = event.properties.functionID;
                    const build = inProgressBuilds.get(functionId);
                    if (build) {
                        const completeBuild: FunctionBuild = {
                            functionId: build.functionId!,
                            handler: build.handler || 'unknown',
                            startTime: build.startTime!,
                            endTime: timestamp,
                            duration: timestamp.getTime() - build.startTime!.getTime(),
                            buildDetails: build.buildDetails
                        };
                        currentSynth.functionBuilds.push(completeBuild);
                        inProgressBuilds.delete(functionId);
                    }
                }
                continue;
            }

            // Try to parse function stats
            const stats = this.extractFunctionStats(line);
            if (stats) {
                const build = inProgressBuilds.get(stats.functionID);
                if (build) {
                    build.handler = stats.handler;
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

        for (let line of lines) {
            const timestamp = this.extractTimestamp(line);
            if (!timestamp) continue;

            // Check for new deploy block
            const deployMatch = line.match(this.DEPLOY_STACKS_PATTERN);
            if (deployMatch?.groups?.stacks) {
                const stackNames = deployMatch.groups.stacks
                    .split(',')
                    .map(s => s.trim().replace(/"/g, ''));

                currentPublish = {
                    startTime: timestamp,
                    endTime: new Date(0),
                    duration: 0,
                    stackDeploys: []
                };

                stackNames.forEach(name => {
                    inProgressStacks.set(name, {
                        name,
                        startTime: timestamp,
                        endTime: new Date(0),
                        duration: 0,
                        status: 'CREATE_COMPLETE',
                        stages: []
                    });
                });
                continue;
            }

            // Look for stack status updates
            if (currentPublish) {
                const stackMatch = line.match(this.STACK_STATUS_PATTERN);
                if (stackMatch?.groups) {
                    const { stackName, status } = stackMatch.groups;
                    const stack = inProgressStacks.get(stackName);
                    
                    if (stack) {
                        stack.stages.push({ status: status as any, timestamp });

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
                            console.log('Unhandled stack status:', status);
                        }
                    }
                }
            }
        }

        return publishBlocks;
    }

    private static extractTimestamp(line: string): Date | null {
        const match = line.match(this.TIMESTAMP_PATTERN);
        return match?.groups?.timestamp ? new Date(match.groups.timestamp) : null;
    }

    private static extractBuildEvent(line: string): BuildEvent | null {
        try {
            const match = line.match(this.EVENT_PATTERN);
            if (!match?.groups?.event) return null;
            
            const event = JSON.parse(match.groups.event) as BuildEvent;
            if (event.type === 'function.build.started' || event.type === 'function.build.success') {
                return event;
            }
            return null;
        } catch (error) {
            console.error('Failed to parse build event:', line, error);
            return null;
        }
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