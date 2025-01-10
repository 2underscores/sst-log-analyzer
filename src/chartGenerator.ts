type TimelineItem = Readonly<{
    name: string;
    startTime: Date;
    endTime: Date;
    status?: string;
}>

/**
 * Generates a Mermaid Gantt chart definition for timeline data
 * @param data Array of timeline items
 * @returns Mermaid Gantt chart definition
 */
export const generateGanttDefinition = (data: TimelineItem[]): string => {
    // Sort data by start time to get correct ordering
    const sortedData = [...data].sort((a, b) => 
        a.startTime.getTime() - b.startTime.getTime()
    );

    // Start building the Gantt definition
    const mermaidDef = [
        'gantt',
        '    title Deployment Timeline',
        '    dateFormat ISO8601',
        '    axisFormat %H:%M:%S',
        ''
    ].join('\n');

    // Add each item as a task
    const tasks = sortedData.map(item => {
        const sanitizedName = item.name.replace(/-/g, ' '); // Mermaid doesn't like dashes in task names
        return `    ${sanitizedName} : ${item.startTime.toISOString()}, ${item.endTime.toISOString()}`;
    }).join('\n');

    return `${mermaidDef}${tasks}`;
};