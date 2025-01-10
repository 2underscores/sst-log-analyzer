import fs from 'node:fs';
import {SSTLogAnalyzer, SynthBlock, PublishBlock} from './sstLogAnalyzer';
import { generateGanttChart } from './textGantt';


const logFilName = '20250108_133321_run_deploy_jez02-reduced'
// const logFilName = '20250108_142943_run_dev_jez04-reduced'

// Read logs & parse analytics
const logContent = await fs.promises.readFile(`./test/logs/${logFilName}.log`, 'utf8');
const synthBlocks = SSTLogAnalyzer.extractSynthesizeBlocks(logContent);
const publishBlocks = SSTLogAnalyzer.extractPublishBlocks(logContent);
const results = {synthBlocks, publishBlocks};
// fs.promises.writeFile(`./test/analytics/${logFilName}.json`, JSON.stringify(results, null, 2));



// Read analytics and write Gantt chart
// const analytics = JSON.parse(await fs.promises.readFile(`./test/analytics/${logFilName}.json`, 'utf8')) as Awaited<ReturnType<typeof analyzeLogFile>>;
const analytics = results
// console.log({ analytics })
if (analytics) {
    const stackDeploys = analytics?.publishBlocks[0].stackDeploys
    // console.log({ stackDeploys })
    const chart = generateGanttChart(stackDeploys);
    console.log(chart);
    // await fs.promises.writeFile(chartFileName, chart);
    // await run(chart, `${logFilName}.png`);
}