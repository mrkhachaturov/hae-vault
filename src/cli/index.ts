import { Command } from 'commander';
import { serveCommand } from './serve.js';
import { metricsCommand } from './metrics.js';
import { sleepCommand } from './sleep.js';
import { workoutsCommand } from './workouts.js';
import { summaryCommand } from './summary.js';
import { queryCommand } from './query.js';
import { sourcesCommand, lastSyncCommand, statsCommand } from './info.js';

export const program = new Command();
program
  .name('hvault')
  .description('Apple Health data vault — ingest + query')
  .version('0.1.0');

program.addCommand(serveCommand);
program.addCommand(metricsCommand);
program.addCommand(sleepCommand);
program.addCommand(workoutsCommand);
program.addCommand(summaryCommand);
program.addCommand(queryCommand);
program.addCommand(sourcesCommand);
program.addCommand(lastSyncCommand);
program.addCommand(statsCommand);
