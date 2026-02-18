#!/usr/bin/env node
import './config.js';  // load dotenv before any command runs
import { program } from './cli/index.js';
program.parse();
