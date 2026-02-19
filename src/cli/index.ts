import { Command } from 'commander';
import { createRequire } from 'node:module';
const { version } = createRequire(import.meta.url)('../../package.json') as { version: string };
import { serveCommand } from './serve.js';
import { metricsCommand } from './metrics.js';
import { sleepCommand } from './sleep.js';
import { workoutsCommand } from './workouts.js';
import { summaryCommand } from './summary.js';
import { queryCommand } from './query.js';
import { sourcesCommand, lastSyncCommand, statsCommand } from './info.js';
import { importCommand } from './import.js';
import { watchCommand } from './watch.js';
import { dashboardCommand } from './dashboard.js';
import { trendsCommand } from './trends.js';
import { startCommand } from './start.js';
import { nutritionCommand } from './nutrition.js';
import { ndashCommand } from './ndash.js';
import { bodyCommand } from './body.js';
import { bdashCommand } from './bdash.js';
import { vitalsCommand } from './vitals.js';
import { vdashCommand } from './vdash.js';
import { mobilityCommand } from './mobility.js';
import { mdashCommand } from './mdash.js';
import { mindfulnessCommand } from './mindfulness.js';
import { wdashCommand } from './wdash.js';

export const program = new Command();
program
  .name('hvault')
  .description('Apple Health data vault — ingest + query')
  .version(version);

program.addCommand(startCommand);
program.addCommand(serveCommand);
program.addCommand(importCommand);
program.addCommand(watchCommand);
program.addCommand(metricsCommand);
program.addCommand(sleepCommand);
program.addCommand(workoutsCommand);
program.addCommand(summaryCommand);
program.addCommand(queryCommand);
program.addCommand(dashboardCommand);
program.addCommand(trendsCommand);
program.addCommand(sourcesCommand);
program.addCommand(lastSyncCommand);
program.addCommand(statsCommand);
program.addCommand(nutritionCommand);
program.addCommand(ndashCommand);
program.addCommand(bodyCommand);
program.addCommand(bdashCommand);
program.addCommand(vitalsCommand);
program.addCommand(vdashCommand);
program.addCommand(mobilityCommand);
program.addCommand(mdashCommand);
program.addCommand(mindfulnessCommand);
program.addCommand(wdashCommand);
