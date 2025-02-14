import fs from 'node:fs';
import { describe, it, expect, beforeAll } from 'vitest';
import { extractSynthesizeBlocks, extractPublishBlocks, extractResourceBlocks } from '@logparser/sstLogAnalyzer';
import { generateGanttChartTextBased } from '@logparser/ganttCharts';

describe('SST deploy', () => {
    let logContent: string;
    const filePath = './test/files';
    const inputFileName = 'example';
  
    beforeAll(async () => {
      logContent = await fs.promises.readFile(`${filePath}/${inputFileName}.log`, 'utf8');
    });

    it('Lambda esbuild', async () => {
        const synthBlocks = extractSynthesizeBlocks(logContent);
        const chartLambda = generateGanttChartTextBased(synthBlocks[0].functionBuilds);
        const filename = `${inputFileName}-lambda.txt`
        // // Uncomment to rewrite comparison data
        // await fs.promises.writeFile(`${filePath}/${filename}`, chartLambda);
        const chartExpected = await fs.promises.readFile(`${filePath}/${filename}`, 'utf8');
        expect(chartLambda).toEqual(chartExpected);
    })

    it('Stack resource deploys', async () => {
        const resourcePublishes = extractResourceBlocks(logContent);
        const chartStack = generateGanttChartTextBased(resourcePublishes.filter((r) => r.stackName.includes('jez08-bosphorus-BaseLambda')));
        const filename = `${inputFileName}-stack.txt`
        // // Uncomment to rewrite comparison data
        // await fs.promises.writeFile(`${filePath}/${filename}`, chartStack);
        const chartExpected = await fs.promises.readFile(`${filePath}/${filename}`, 'utf8');
        expect(chartStack).toEqual(chartExpected);
    })

    it('Overall app', async () => {
        const publishBlocks = extractPublishBlocks(logContent);
        const chartApp = generateGanttChartTextBased(publishBlocks[0].stackDeploys);
        const filename = `${inputFileName}-app.txt`
        // // Uncomment to rewrite comparison data
        // await fs.promises.writeFile(`${filePath}/${filename}`, chartApp);
        const chartExpected = await fs.promises.readFile(`${filePath}/${filename}`, 'utf8');
        expect(chartApp).toEqual(chartExpected);
    })
})
