#!/usr/bin/env node
import { runMain } from "../dist/cli/main.js"

process.exitCode = await runMain(process.argv.slice(2))
