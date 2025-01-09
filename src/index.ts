import fs from 'node:fs';
import SSTLogAnalyzer from './sstLogAnalyzer';

async function analyzeLogFile(filePath: string) {
    try {
        const logContent = await fs.promises.readFile(filePath, 'utf8');
        const synthBlocks = SSTLogAnalyzer.extractSynthesizeBlocks(logContent);
        console.log({ synthBlocks });
        console.log({ buildExample: synthBlocks[0].functionBuilds[0]});
        const publishBlocks = SSTLogAnalyzer.extractPublishBlocks(logContent);
        console.log({ publishBlocks });
        console.log({ stackDeployExample: publishBlocks[0].stackDeploys[0]});
        console.log({ stackDeployStagesExample: publishBlocks[0].stackDeploys[0].stages});
    } catch (error) {
        console.error('Error analyzing log file:', error);
    }
}

analyzeLogFile('./test-logs/20250108_133321_run_deploy_jez02-reduced.log');
// analyzeLogFile('./test-logs/20250108_142943_run_dev_jez04-reduced.log');