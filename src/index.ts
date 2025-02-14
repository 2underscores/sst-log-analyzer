import fs from 'node:fs';
import { SSTLogAnalyzer, SynthBlock, PublishBlock } from './sstLogAnalyzer';
import { generateGanttChartTextBased } from './ganttCharts';
import {basename, extname} from 'path';



// TODO: Change script to be run as CLI and accept a input log file path param
// const localFilName = '20250110_193931_run_build_jez06_concurrency_1'
// const localFilName = '20250110_180503_run_build_jez06_concurrency_2'
// const localFilName = '20250110_195007_run_build_jez06_concurrency_9_hot'
// const localFilName = '20250111_092540_run_build_jez06'
// const localFilName = '20250108_133321_run_deploy_jez02-reduced'
// const localFilName = '20250108_133321_run_deploy_jez02'
// const localFilName = '20250114_120520_run_deploy_jez08'
// const localFilName = '20250108_142943_run_dev_jez04-reduced'
// const localFilName = '20250114_114539_run_dev_jez07'
// const localFilName = '1736908581-runner-zte-mnql-project-38246986-concurrent-0-sst-debug'
// const localFilName = '1737017532-runner-zte-mnql-project-38246986-concurrent-0-sst-debug'
// const localFilName = '1737511161-runner-zte-mnql-project-38246986-concurrent-0-sst-debug' // This
// const localFilName = '1737672488-runner-zte-mnql-project-38246986-concurrent-0-sst-debug'
// const localFilName = '1737327387-Jeremys-MacBook-Pro.local-sst-debug'
// const localFilName = 'local-cdn-split-debug'
// const localFilName = '1738030515-runner-zte-mnql-project-38246986-concurrent-0-sst-debug' // CDN split out
// const localFilName = 'debug-log-auth-need-baseinfra'
// const localFilName = '2025-01-31_08-40-24_debug'
// const localFilName = '2025-01-31_12-21-53_debug' // 18m This one is BEFORE PLAT-998 PR. jez25
// const localFilName = '2025-02-03_10-39-03_debug' // 22m This one is BEFORE PLAT-998 PR. jez28
// const localFilName = '2025-02-05_18-23-27_debug' // This one is with BOTH old and new jez40. DEV run not deploy
// const localFilName = '2025-01-31_11-15-51_debug' // This one is after PLAT-998 PR. New stacks: Certs, Cdns, B2cGateway
// const localFilName = '2025-02-04_10-27-44_debug' // This one is with BOTH old and new jez35
// const localFilName = '2025-02-05_19-15-08_debug' // jez40 transition legacy to new. DANGER - long running BaseLambda (CDN update)
// const localFilName = '2025-02-05_20-42-16_debug' // jez44 18m new deploy of legacy on & used
// const localFilName = '2025-02-05_22-00-51_debug' // jez44 depllegacy off (infra teardown)
// const localFilName = '2025-02-06_20-20-37_debug' // jez55 - deploy all, legacy 20m, routes split off
// const localFilName = '2025-02-07_09-51-25_debug' // jez57 dev deploy - 15m, long CDN. deploy all, legacy 20m, routes split off
// const localFilName = '2025-02-07_10-38-42_debug' // jez58 - last master deploy, 24m deploy, holy fuck. Long ass CDN.
const localFilName = '2025-02-11_21-28-36_noBaseL_jez83_7m'
// const localFilName = '2025-02-11_21-58-59_noBaseL_jez85_6m'


// CLI override option
const cliInputFilePath = process.argv[2]
let inputFileName: string, inputFilePath: string
if (cliInputFilePath) {
  inputFilePath = cliInputFilePath
  inputFileName = basename(cliInputFilePath, extname(cliInputFilePath));
} else {
  inputFilePath = `./examples/logs/${localFilName}.log`;
  inputFileName = localFilName;
}
console.log({inputFilePath, inputFileName})

// Read logs, parse analytics, save to file
const logContent = await fs.promises.readFile(inputFilePath, 'utf8');
const synthBlocks = SSTLogAnalyzer.extractSynthesizeBlocks(logContent);
const publishBlocks = SSTLogAnalyzer.extractPublishBlocks(logContent);
const resourcePublishes = SSTLogAnalyzer.extractResourceBlocks(logContent);
const results = { synthBlocks, publishBlocks, resourcePublishes };
console.log(publishBlocks)

// console.log({ results })
await fs.promises.writeFile(`./examples/analytics/${inputFileName}.json`, JSON.stringify(results, null, 2));
// Read analytics file and format date values
const analytics = JSON.parse(
    await fs.promises.readFile(`./examples/analytics/${inputFileName}.json`, 'utf8'),
    (key, value) => (key === 'startTime' || key === 'endTime') && typeof value === 'string' ? new Date(value) : value
) as typeof results;
// console.log({ analytics })
// Create gantt chart
const stackNames = analytics?.publishBlocks.flatMap(r => r.stackDeploys.map(s => s.name));
// console.log({stackNames})
for (const stackName of stackNames) {
  const data = analytics?.resourcePublishes.filter((r) => r.stackName.includes(stackName));
  const resourceDeployChart = generateGanttChartTextBased(data.filter(r => !r.name.includes('SourcemapUploader')));
  // console.log({stackName})
  // console.log(resourceDeployChart);
}
const fnBuildChart = generateGanttChartTextBased(analytics?.synthBlocks[0].functionBuilds);
// console.log(fnBuildChart);
const stackDeployChart = generateGanttChartTextBased(analytics?.publishBlocks[0].stackDeploys);
console.log(stackDeployChart);
console.log({inputFilePath, inputFileName})