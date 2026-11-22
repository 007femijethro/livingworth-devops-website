import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const read=file=>fs.readFile(new URL('../dist/'+file,import.meta.url),'utf8');
test('built public pages have unique metadata and canonical primary domain',async()=>{
 const titles=new Set();
 for(const [file,path] of [['index.html','/'],['apply/index.html','/apply'],['portfolio/index.html','/portfolio/'],['privacy.html','/privacy.html'],['terms-and-conditions.html','/terms-and-conditions.html']]){
  const html=await read(file);assert.equal([...html.matchAll(/<title>/g)].length,1);const title=html.match(/<title>([^<]+)/)[1];assert.ok(!titles.has(title));titles.add(title);
  assert.equal([...html.matchAll(/rel="canonical"/g)].length,1);assert.ok(html.includes(`href="https://academy.livingworth.co.uk${path}"`));assert.match(html,/<meta property="og:image"/);assert.match(html,/name="twitter:card"/);
 }
});
test('homepage is readable before JavaScript and private fallback contains no public marketing',async()=>{
 const home=await read('index.html');assert.match(home,/<h1>DevOps training/);assert.match(home,/DevOps training questions/);assert.match(home,/href="\/apply"/);
 const raw=home.match(/<script id="academy-structured-data" type="application\/ld\+json">([^<]+)/)[1];const schema=JSON.parse(raw);assert.equal(schema['@graph'][0]['@type'],'EducationalOrganization');
 const shell=await read('app-shell.html');assert.match(shell,/noindex,nofollow/);assert.doesNotMatch(shell,/rel="canonical"|academy-structured-data|<h1>/);
 const robots=await read('robots.txt');assert.match(robots,/Sitemap: https:\/\/academy.livingworth.co.uk\/sitemap.xml/);assert.doesNotMatch(robots,/Disallow: \/portal/);
 const sitemap=await read('sitemap.xml');assert.equal([...sitemap.matchAll(/<loc>/g)].length,5);assert.doesNotMatch(sitemap,/portal|review|uploads|reset/);
});
