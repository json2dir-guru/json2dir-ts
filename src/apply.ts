import * as fs from "node:fs";
import * as path from "node:path";
import type { Dir, Entry } from "./tree.js";

export class Conflict extends Error {}

function lstat(p: string): fs.Stats | undefined {
  return fs.lstatSync(p, { throwIfNoEntry: false });
}

// §5.2, §5.3: an existing non-directory is removed (a symlink itself, never its target).
// §5.4: a directory in the way of anything but an object is an error, and is left alone.
function makeRoom(p: string, existing: fs.Stats | undefined): void {
  if (!existing) return;
  if (existing.isDirectory()) throw new Conflict(`${p}: a directory is in the way`);
  fs.unlinkSync(p);
}

function writeFile(p: string, content: string, executable: boolean): void {
  // "wx" is O_CREAT | O_EXCL: it never writes through an entry that appeared after makeRoom.
  const fd = fs.openSync(p, "wx", 0o666);
  try {
    fs.writeFileSync(fd, content);
    // §4.4.2: add 0111 to whatever the umask left.
    if (executable) fs.fchmodSync(fd, (fs.fstatSync(fd).mode & 0o7777) | 0o111);
  } finally {
    fs.closeSync(fd);
  }
}

function create(p: string, entry: Entry): void {
  const existing = lstat(p);
  switch (entry.kind) {
    case "dir":
      // §5.1: an existing directory is used as is; §5.3: a link to one is replaced.
      if (!existing?.isDirectory()) {
        if (existing) fs.unlinkSync(p);
        fs.mkdirSync(p);
      }
      apply(p, entry);
      return;
    case "file":
    case "script":
      makeRoom(p, existing);
      writeFile(p, entry.content, entry.kind === "script");
      return;
    case "link":
      makeRoom(p, existing);
      fs.symlinkSync(entry.target, p);
      return;
  }
}

export function apply(dir: string, tree: Dir): void {
  for (const [name, entry] of tree.entries) create(path.join(dir, name), entry);
}
