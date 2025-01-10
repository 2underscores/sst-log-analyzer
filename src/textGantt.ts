interface objectType {
    name: string;
    startTime: string;
    endTime: string;
    duration: number;
    status: string;
    stages: {
        status: string;
        timestamp: string;
    }[];
}

export function generateGanttChart(tasks: objectType[]): string {
    const taskNamePadding = 50;
    if (tasks.length === 0) return "No tasks provided.";

    // Step 1: Convert startTime and endTime to Date objects
    const taskTimes = tasks.map(task => ({
        ...task,
        startTime: new Date(task.startTime),
        endTime: new Date(task.endTime),
    }));

    // Step 2: Find the overall time range for the chart
    const minTime = Math.min(...taskTimes.map(task => task.startTime.getTime()));
    const maxTime = Math.max(...taskTimes.map(task => task.endTime.getTime()));
    const timeRange = maxTime - minTime;

    // Step 3: Calculate tick spacing (at least 20 ticks)
    const tickCount = Math.max(20, tasks.length * 2);
    const tickInterval = timeRange / tickCount;
    const tickDates = Array.from({ length: tickCount + 1 }, (_, i) =>
        new Date(minTime + tickInterval * i)
    );

    // Step 4: Format timeline dates as HH:mm:ss
    const timeline = tickDates
        .map(date => date.toISOString().slice(11, 19)) // HH:mm:ss format
        .map(date => date.padEnd(9))
        .join("");

    // Step 5: Create the Gantt chart rows for each task
    const chartRows = taskTimes.map(task => {
        const row = new Array(tickCount + 1).fill(" ");
        const taskStartIndex = Math.floor((task.startTime.getTime() - minTime) / tickInterval);
        const taskEndIndex = Math.ceil((task.endTime.getTime() - minTime) / tickInterval);

        for (let i = taskStartIndex; i <= taskEndIndex; i++) {
            row[i] = "█";
        }

        return `${task.name.padEnd(taskNamePadding)} | ${row.join("")}`;
    });

    // Step 6: Assemble the final chart
    return `${"Task".padEnd(taskNamePadding)} | ${timeline}\n${"-".repeat(40 + timeline.length + 3)}\n${chartRows.join("\n")}`;
}