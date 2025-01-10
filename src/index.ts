import fs from 'node:fs';
import { SSTLogAnalyzer, SynthBlock, PublishBlock } from './sstLogAnalyzer';
import { generateGanttChartTextBased } from './ganttCharts';

const logFilName = '20250108_133321_run_deploy_jez02-reduced'
// const logFilName = '20250108_142943_run_dev_jez04-reduced'

// Read logs, parse analytics, save to file
const logContent = await fs.promises.readFile(`./test/logs/${logFilName}.log`, 'utf8');
const synthBlocks = SSTLogAnalyzer.extractSynthesizeBlocks(logContent);
const publishBlocks = SSTLogAnalyzer.extractPublishBlocks(logContent);
const results = { synthBlocks, publishBlocks };
console.log({ results })
await fs.promises.writeFile(`./test/analytics/${logFilName}.json`, JSON.stringify(results, null, 2));


// Read analytics file and format date values
const analytics = JSON.parse(
    await fs.promises.readFile(`./test/analytics/${logFilName}.json`, 'utf8'),
    (key, value) => (key === 'startTime' || key === 'endTime') && typeof value === 'string' ? new Date(value) : value
) as typeof results;
console.log({ analytics })
// Create gantt chart
const fnBuildChart = generateGanttChartTextBased(analytics?.synthBlocks[0].functionBuilds);
const stackDeployChart = generateGanttChartTextBased(analytics?.publishBlocks[0].stackDeploys);
console.log(fnBuildChart);
console.log();
console.log(stackDeployChart);
