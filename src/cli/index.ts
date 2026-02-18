import { Command } from 'commander';
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

export const program = new Command();
program
  .name('hvault')
  .description('Apple Health data vault — ingest + query')
  .version('0.2.0');

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
