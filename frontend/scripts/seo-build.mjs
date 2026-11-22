import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try{
 const {renderPublicPage,pageSeo,siteOrigin}=await server.ssrLoadModule('/src/seo-prerender.tsx');
 const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 const template=await fs.readFile('dist/index.html','utf8');
 function metadata(html,page){const d=pageSeo(page);html=html.replace(/<title>[^<]*<\/title>/,'').replace(/<meta[^>]+(?:name=["'](?:description|robots|twitter:[^"']+)["']|property=["']og:[^"']+["'])[^>]*>/g,'').replace(/<link[^>]+rel=["']canonical["'][^>]*>/g,'');
 const image=siteOrigin+(page==='portfolio'?'/portfolio/jethro-portrait.webp':'/devops-mentor-lab.jpg');
 const head=`<title>${escape(d.title)}</title>\n<meta name="description" content="${escape(d.description)}"><meta name="robots" content="${d.index?'index,follow,max-image-preview:large':'noindex,nofollow'}">${d.canonical?`<link rel="canonical" href="${d.canonical}">`:''}<meta property="og:type" content="website"><meta property="og:site_name" content="Livingworth Academy"><meta property="og:title" content="${escape(d.title)}"><meta property="og:description" content="${escape(d.description)}"><meta property="og:url" content="${d.canonical||siteOrigin}"><meta property="og:image" content="${image}"><meta property="og:image:alt" content="Practical DevOps learning at Livingworth Academy"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(d.title)}"><meta name="twitter:description" content="${escape(d.description)}"><meta name="twitter:image" content="${image}">`;
 return html.replace('</head>',head+'\n</head>');}
 await fs.writeFile('dist/app-shell.html',metadata(template,'private'));
 for(const [page,file] of [['home','index.html'],['register','apply/index.html']]){
  let html=metadata(template,page).replace('<div id="root"></div>',`<div id="root">${renderPublicPage(page)}</div>`);
  if(page==='home'){
   const data={'@context':'https://schema.org','@graph':[{'@type':'EducationalOrganization','@id':siteOrigin+'/#academy',name:'Livingworth Academy',url:siteOrigin+'/',logo:siteOrigin+'/livingworth-wordmark.png',telephone:['+2348066483401','+2348103961110']},{'@type':'Course',name:'DevOps Engineering',description:pageSeo('home').description,provider:{'@id':siteOrigin+'/#academy'}}]};
   html=html.replace('</head>',`<script id="academy-structured-data" type="application/ld+json">${JSON.stringify(data).replaceAll('<','\\u003c')}</script></head>`);
  }
  await fs.mkdir(path.dirname('dist/'+file),{recursive:true});await fs.writeFile('dist/'+file,html);
 }
 for(const [page,file] of [['portfolio','portfolio/index.html'],['privacy','privacy.html'],['terms','terms-and-conditions.html']]){const html=await fs.readFile('dist/'+file,'utf8');await fs.writeFile('dist/'+file,metadata(html.replaceAll('https://bridgess.co.uk','https://academy.livingworth.co.uk'),page));}
 const urls=['/','/apply','/portfolio/','/privacy.html','/terms-and-conditions.html'];
 await fs.writeFile('dist/sitemap.xml','<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(url=>`<url><loc>${siteOrigin+url}</loc></url>`).join('')+'</urlset>');
 await fs.writeFile('dist/robots.txt',`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /uploads/\n\nSitemap: ${siteOrigin}/sitemap.xml\n`);
 console.log('SEO: public HTML, metadata, structured data, sitemap and robots.txt generated.');
}finally{await server.close();}
