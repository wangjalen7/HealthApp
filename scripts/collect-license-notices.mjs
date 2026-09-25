import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
const notices = [], seen = new Set();
for(const [relative, info] of Object.entries(lock.packages)) {
  if(!relative.includes('node_modules/') || info.dev || info.link) continue;
  const folder = path.join(root,relative);
  if(!fs.existsSync(path.join(folder,'package.json'))) continue;
  const pkg = JSON.parse(fs.readFileSync(path.join(folder,'package.json'),'utf8'));
  const id = pkg.name+'@'+pkg.version;
  if(seen.has(id)) continue;
  seen.add(id);
  const files = fs.readdirSync(folder).filter(f=>/^(licen[sc]e|copying|notice)(\.|$)/i.test(f) && fs.statSync(path.join(folder,f)).isFile());
  notices.push({name:pkg.name,version:pkg.version,license:typeof pkg.license==='string'?pkg.license:'Review required',text:files.length?files.map(f=>fs.readFileSync(path.join(folder,f),'utf8')).join('\n\n'):'License text not found in installed package. Review required before distribution.'});
}
notices.sort((a,b)=>a.name.localeCompare(b.name));
fs.writeFileSync(path.join(root,'legal','third-party-notices.json'),JSON.stringify(notices,null,2)+'\n');
console.log(`${notices.length} installed non-development package notices collected; ${notices.filter(n=>n.text.includes('Review required before distribution')).length} require source-license review. Native artifacts/assets require separate review.`);
