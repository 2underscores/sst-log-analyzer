import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { extractSynthesizeBlocks, extractPublishBlocks, extractResourceBlocks } from '@logparser/sstLogAnalyzer';
import { generateGanttChartTextBased } from '@logparser/ganttCharts';
import { basename, extname } from 'path';


describe('Log Parser', () => {
    it('should parse a valid log file', async () => {
        const inputFileName = '20250114_120520_run_deploy_jez08'
        const inputFilePath = `./examples/logs/${inputFileName}.log`;
        // Read logs, parse analytics, save to file
        const logContent = await fs.promises.readFile(inputFilePath, 'utf8');
        const synthBlocks = extractSynthesizeBlocks(logContent);
        const publishBlocks = extractPublishBlocks(logContent);
        const resourcePublishes = extractResourceBlocks(logContent);
        const results = { synthBlocks, publishBlocks, resourcePublishes };
        const fnBuildChart = generateGanttChartTextBased(results.synthBlocks[0].functionBuilds);
        console.log(fnBuildChart);
        const stackNames = results.publishBlocks.flatMap(r => r.stackDeploys.map(s => s.name));
        const data = results.resourcePublishes.filter((r) => r.stackName.includes(stackNames[0]));
        const resourceDeployChart = generateGanttChartTextBased(data.filter(r => !r.name.includes('SourcemapUploader')));
        console.log(resourceDeployChart);
        const stackDeployChart = generateGanttChartTextBased(results.publishBlocks[0].stackDeploys);
        console.log(stackDeployChart);
        console.log(publishBlocks)
    })
})