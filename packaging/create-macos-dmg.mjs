import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

export function createMacOSDiskImage(app, destination) {
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'cyh-dmg-'));
  function run(command, args) {
    const result = spawnSync(command, args, {stdio:'inherit', timeout:300000});
    if (result.error || result.status !== 0) throw Error(`${command}: ${result.error?.message ?? result.status}`);
  }
  try {
    run('ditto', [app, path.join(staging, 'cleanYourHarmony.app')]);
    fs.symlinkSync('/Applications', path.join(staging, 'Applications'));
    run('hdiutil', ['create', '-volname', 'cleanYourHarmony', '-srcfolder', staging, '-ov', '-format', 'UDZO', destination]);
  } finally {
    fs.rmSync(staging, {recursive:true, force:true});
  }
}
