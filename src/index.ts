import fs from 'node:fs';
import { SSTLogAnalyzer, SynthBlock, PublishBlock } from './sstLogAnalyzer';
import { generateGanttChartTextBased } from './ganttCharts';

// const logFilName = '20250110_193931_run_build_jez06_concurrency_1'
// const logFilName = '20250110_180503_run_build_jez06_concurrency_2'
// const logFilName = '20250110_195007_run_build_jez06_concurrency_9_hot'
// const logFilName = '20250111_092540_run_build_jez06'
// const logFilName = '20250108_133321_run_deploy_jez02-reduced'
const logFilName = '20250108_133321_run_deploy_jez02'
// const logFilName = '20250108_142943_run_dev_jez04-reduced'

// Read logs, parse analytics, save to file
const logContent = await fs.promises.readFile(`./test/logs/${logFilName}.log`, 'utf8');
const synthBlocks = SSTLogAnalyzer.extractSynthesizeBlocks(logContent);
const publishBlocks = SSTLogAnalyzer.extractPublishBlocks(logContent);
const resourcePublishes = SSTLogAnalyzer.extractResourceBlocks(logContent);
const results = { synthBlocks, publishBlocks, resourcePublishes };
console.log({ results })
await fs.promises.writeFile(`./test/analytics/${logFilName}.json`, JSON.stringify(results, null, 2));


// Read analytics file and format date values
const analytics = JSON.parse(
    await fs.promises.readFile(`./test/analytics/${logFilName}.json`, 'utf8'),
    (key, value) => (key === 'startTime' || key === 'endTime') && typeof value === 'string' ? new Date(value) : value
) as typeof results;
// console.log({ analytics })
// Create gantt chart
const fnBuildChart = generateGanttChartTextBased(analytics?.synthBlocks[0].functionBuilds);
// console.log(fnBuildChart);
const stackDeployChart = generateGanttChartTextBased(analytics?.publishBlocks[0].stackDeploys);
// console.log(stackDeployChart);
const stackNames = [
    'jez02-bosphorus-BaseInfra',
    'jez02-bosphorus-Logs',
    'jez02-bosphorus-OnboardingAndIdentityMonitoring',
    'jez02-bosphorus-TransactionBanking',
    'jez02-bosphorus-Persistence',
    'jez02-bosphorus-TxbMonitoring',
    'jez02-bosphorus-OpsConsolePersistence',
    'jez02-bosphorus-Auth',
    'jez02-bosphorus-BaseLambda',
    'jez02-bosphorus-DevStack',
    'jez02-bosphorus-OnboardingAndIdentity',
    'jez02-bosphorus-OnboardingAndIdentityEvents',
    'jez02-bosphorus-OnboardingAndIdentityKYX',
    'jez02-bosphorus-TxbAccounts',
    'jez02-bosphorus-TxbBusinessBanking',
    'jez02-bosphorus-TxbPayments',
    'jez02-bosphorus-TxbTermDeposit'
  ] as const;
const stack: typeof stackNames[number] = 'jez02-bosphorus-Logs';
const resourceDeployChart = generateGanttChartTextBased(analytics?.resourcePublishes);
// const resourceDeployChart = generateGanttChartTextBased(analytics?.resourcePublishes.filter((r) => r.stackName === stack));
console.log(resourceDeployChart);

