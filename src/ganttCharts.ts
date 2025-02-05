interface ObjectType {
    name: string;
    startTime: Date;
    endTime: Date;
}

export function generateGanttChartTextBased(tasks: ObjectType[]): string {
    tasks.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    const maxNameWidth = 70;
    tasks.forEach(task => {task.name = task.name.length > maxNameWidth ? task.name.slice(0,maxNameWidth-2)+'...' : task.name}); // Trim names that are too long
    const taskNameWidth = Math.max(...tasks.map(task => task.name.length));
    const timeTickWidth = 10; // HH:mm:ss format
    const timeTickCount = 10; // 15 time stamps on x axis
    const rowChartWidth = (timeTickCount+1) * timeTickWidth
    if (tasks.length === 0) return "No tasks provided.";

    // Find the overall time range for the chart
    const minTime = Math.min(...tasks.map(task => task.startTime.getTime()));
    const maxTime = Math.max(...tasks.map(task => task.endTime.getTime()));
    const timeRange = maxTime - minTime;

    // Create X axis time tick labels
    const tickInterval = timeRange / timeTickCount;
    const tickDates = Array.from(
        { length: timeTickCount + 1 },
        (_, i) => new Date(minTime + tickInterval * i)
    );
    const timeline = tickDates.map(date => date.toISOString().slice(11, 19).padEnd(timeTickWidth)).join("");  // HH:mm:ss

    // Create the gantt chart row bars
    const chartRows = tasks.map(task => {
        const taskStartIndex = Math.floor((task.startTime.getTime() - minTime) / (tickInterval/timeTickWidth));
        const taskEndIndex = Math.ceil((task.endTime.getTime() - minTime) / (tickInterval/timeTickWidth));
        const row = "·".repeat(taskStartIndex) + "█".repeat(taskEndIndex - taskStartIndex) + "·".repeat(rowChartWidth - taskEndIndex);
        return `${task.name.padEnd(taskNameWidth)} | ${row}`;
    });

    // Assemble the final chart
    return [ 
        `${"Stack".padEnd(taskNameWidth)} | ${timeline}`,    // Header row
        `${"-".repeat(taskNameWidth + rowChartWidth + 3)}`, // separator
        `${chartRows.join("\n")}`].join("\n");              // Body of chart
}

// Test functionality
if (new URL(import.meta.url).pathname === process.argv[1]) {
    const tasks = [
        { name: "Task A", startTime: new Date("2025-01-01T09:00:00"), endTime: new Date("2025-01-01T09:45:00") },
        { name: "Task B", startTime: new Date("2025-01-01T09:00:00"), endTime: new Date("2025-01-01T09:15:00") },
        { name: "Task C", startTime: new Date("2025-01-01T09:10:00"), endTime: new Date("2025-01-01T09:30:00") },
        { name: "Task D", startTime: new Date("2025-01-01T09:20:00"), endTime: new Date("2025-01-01T09:45:00") }
    ];
    console.log(generateGanttChartTextBased(tasks));
}