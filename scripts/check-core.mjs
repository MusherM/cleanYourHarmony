import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { coreFiles, contentDigest } from '../core/integrity.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const shared=['.gitattributes','AGENTS.md','CLAUDE.md','core','operations.json','scripts/run.mjs','scripts/catalog.mjs','scripts/session.mjs','scripts/routes.mjs','scripts/runner.mjs','scripts/device.mjs','scripts/navigator.mjs','scripts/ui-tree.mjs','scripts/runner.test.mjs','scripts/session.test.mjs','scripts/core.test.mjs','scripts/fixtures','scripts/check-core.mjs','dev/core-extension.md','dev/core-extension.en.md','.github/workflows/core-checks.yml'];
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const args=process.argv.slice(2), pin=args[0]==='--pin' ? args[1] : null;
if (args.length && (!pin || args.length!==2)) throw new Error('用法：node scripts/check-core.mjs [--pin <main commit>]');
const lockPath=path.join(root,'core-source.json');
const lock=pin ? {schemaVersion:1,commit:git('rev-parse',pin+'^{commit}')} : JSON.parse(fs.readFileSync(lockPath));
if (!/^[a-f0-9]{40}$/.test(lock.commit)) throw new Error('内核来源提交无效');
// Verify against main, never against an arbitrary desktop-only commit.
let mainRef;
try { git('rev-parse','--verify','refs/remotes/origin/main'); mainRef='refs/remotes/origin/main'; } catch { mainRef='refs/heads/main'; }
// Local main may contain the authorized, not-yet-pushed core commit.
try { git('merge-base','--is-ancestor',lock.commit,mainRef); }
catch { git('merge-base','--is-ancestor',lock.commit,'refs/heads/main'); }
git('diff','--exit-code',lock.commit,'--',...shared);
if (git('ls-files','--others','--exclude-standard','--',...shared)) throw new Error('共享路径存在未跟踪文件');
const files=coreFiles(root),digest=contentDigest(files);
if (pin) fs.writeFileSync(lockPath,JSON.stringify({...lock,digest,files},null,2)+'\n');
else if (lock.digest!==digest || JSON.stringify(lock.files)!==JSON.stringify(files)) throw new Error('内核内容与来源锁不一致');
console.log('PASS: shared core '+lock.commit+' '+digest);
