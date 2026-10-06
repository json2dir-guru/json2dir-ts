#!/usr/bin/env node
// json2dir: create the directory tree a JSON document describes, in the current directory.
// Implements RFC J2D-1 (https://github.com/kitsunoff/awesome-json2dir/blob/main/spec/rfc-json2dir.md).
import * as fs from "node:fs";
import { apply } from "./apply.js";
import { parse, toTree } from "./tree.js";

function main(args: readonly string[]): number {
  // §7: no arguments; any argument is a usage error.
  if (args.length > 0) {
    process.stderr.write("usage: json2dir < document.json\n");
    return 2;
  }
  try {
    // §6: the whole document is parsed and validated before anything is written.
    const tree = toTree(parse(fs.readFileSync(0)));
    apply(".", tree);
    return 0;
  } catch (e) {
    process.stderr.write(`json2dir: ${e instanceof Error ? e.message : String(e)}\n`);
    return 1;
  }
}

process.exitCode = main(process.argv.slice(2));
