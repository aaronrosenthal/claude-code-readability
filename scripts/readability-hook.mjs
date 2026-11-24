#!/usr/bin/env node
import { main } from '../src/hook/run.mjs';

const flag = (name) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
const env = { ...process.env };
if (flag('feedback')) env.READABILITY_FEEDBACK = flag('feedback');
if (flag('mode')) env.READABILITY_MODE = flag('mode');

process.exitCode = await main({ env });
