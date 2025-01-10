import fs from 'node:fs';
import {SSTLogAnalyzer, SynthBlock, PublishBlock} from './sstLogAnalyzer';
import { generateGanttChart } from './textGantt';


async function analyzeLogFile(filePath: string) {
    try {
        const logContent = await fs.promises.readFile(filePath, 'utf8');
        const synthBlocks = SSTLogAnalyzer.extractSynthesizeBlocks(logContent);
        const publishBlocks = SSTLogAnalyzer.extractPublishBlocks(logContent);
        return { synthBlocks, publishBlocks };
    } catch (error) {
        console.error('Error analyzing log file:', error);
    }
}


const logFilName = '20250108_133321_run_deploy_jez02-reduced'
// const logFilName = '20250108_142943_run_dev_jez04-reduced'

// Read logs & write analytics
const results = await analyzeLogFile(`./test/logs/${logFilName}.log`);
// fs.promises.writeFile(`./test/analytics/${logFilName}.json`, JSON.stringify(results, null, 2));

// Read analytics and write Gantt chart
// const analytics = JSON.parse(await fs.promises.readFile(`./test/analytics/${logFilName}.json`, 'utf8')) as Awaited<ReturnType<typeof analyzeLogFile>>;
const analytics = results
console.log({ analytics })
if (analytics) {
    const stackDeploys = analytics?.publishBlocks[0].stackDeploys
    console.log({ stackDeploys })
    const chart = generateGanttChart(stackDeploys);
    console.log(chart);
    // await fs.promises.writeFile(chartFileName, chart);
    // await run(chart, `${logFilName}.png`);
}


//  TEST
const tasks = [
    { name: "Task A", startTime: new Date("2025-01-01"), endTime: new Date("2025-01-05") },
    { name: "Task B", startTime: new Date("2025-01-03"), endTime: new Date("2025-01-07") },
    { name: "Task C", startTime: new Date("2025-01-06"), endTime: new Date("2025-01-10") }
];
console.log(generateGanttChart(tasks));