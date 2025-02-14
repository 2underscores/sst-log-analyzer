import { Command } from 'commander';
import fs from 'node:fs';
import { extractPublishBlocks, extractResourceBlocks, extractSynthesizeBlocks } from './sstLogAnalyzer';
import { generateGanttChartTextBased } from './ganttCharts';
import { format } from 'date-fns';

const parseArgs = () => {
  const defaultLogs = '/Users/jeremysmith/Desktop/projects/cxnpl/bosphorus-middleware/.sst/debug.log';
  const timestring = format(new Date(), "yyyyMMdd_HHmmss");
  const defaultOutFile = `${timestring}-sst-debug.log`
  const program = new Command()
    .option('-i, --input <path>', 'Input log file', defaultLogs)
    .option('--save', 'Save log for future use')
    .option('--save-name <name>', 'If saving, overwrite for save file name', defaultOutFile)
    .option('-a, --graph-app', 'Print app graph')
    .option('-s, --graph-stacks', 'Print stacks graph')
    .option('--graph-stack-filter <filter>', 'If printing stacks, filter for stacks with this string e.g. "BaseLambda', '')
    .option('-b, --graph-build', 'Print build graph')
    .parse();
  const opts = program.opts();
  console.log(opts);
  return opts;
}

const printGraphs = async () => {
  const args = parseArgs();

  const logContent = await fs.promises.readFile(args.input, 'utf8');
  if (args.save) {
    await fs.promises.writeFile(`./example-logs/${args.saveName}`, logContent);
  }

  const synthBlocks = extractSynthesizeBlocks(logContent);
  const publishBlocks = extractPublishBlocks(logContent);
  const resourcePublishes = extractResourceBlocks(logContent);

  if (args.graphStacks) {
    const stackNames = publishBlocks.flatMap(r => r.stackDeploys.map(s => s.name));
    for (const stackName of stackNames.filter((s) => s.includes(args.graphStackFilter))) {
      const data = resourcePublishes.filter((r) => r.stackName.includes(stackName));
      const resourceDeployChart = generateGanttChartTextBased(data.filter(r => !r.name.includes('SourcemapUploader')));
      console.log({ stackName });
      console.log(resourceDeployChart);
    }
  }

  if (args.graphBuild) {
    const fnBuildChart = generateGanttChartTextBased(synthBlocks[0].functionBuilds);
    console.log(fnBuildChart);
  }

  if (args.graphApp) {
    const stackDeployChart = generateGanttChartTextBased(publishBlocks[0].stackDeploys);
    console.log(stackDeployChart);
  }
}

printGraphs();