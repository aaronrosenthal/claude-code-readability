#!/usr/bin/env node
import { main } from '../src/hook/run.mjs';

const feedbackFlag = process.argv.find((argument) => argument.startsWith('--feedback='));
const env = feedbackFlag ? { ...process.env, READABILITY_FEEDBACK: feedbackFlag.slice('--feedback='.length) } : process.env;

process.exitCode = await main({ env });
