import { Command } from 'commander';
import { serveCommand } from './serve.js';

export const program = new Command();
program
  .name('hvault')
  .description('Apple Health data vault — ingest + query')
  .version('0.1.0');

program.addCommand(serveCommand);
