export const siteOrigin = 'https://academy.livingworth.co.uk';
export const siteDescription = 'Learn DevOps with Livingworth Academy in Nigeria. Practical online and physical training in Linux, AWS, Docker, Kubernetes, Terraform and CI/CD.';
const pages:Record<string,{title:string;description:string;path:string}>={
 home:{title:'DevOps Training in Nigeria | Livingworth Academy',description:siteDescription,path:'/'},
 register:{title:'Apply for DevOps Training | Livingworth Academy',description:'Apply to Livingworth Academy for practical DevOps training. Explore online, physical and hybrid learning, hands-on projects and mentor support.',path:'/apply'},
 portfolio:{title:'Jethro F.M | DevOps Engineer & Livingworth Academy Mentor',description:'Meet Jethro Femi-Muyiwa, DevOps and integration engineer, full-stack developer since 2016 and lead mentor at Livingworth Academy.',path:'/portfolio/'},
 privacy:{title:'Privacy Policy | Livingworth Academy',description:'Read how Livingworth Academy handles personal information, account details and learner data.',path:'/privacy.html'},
 terms:{title:'Terms and Conditions | Livingworth Academy',description:'Read the terms and conditions for Livingworth Academy training, applications and use of the student portal.',path:'/terms-and-conditions.html'}
};
export function pageSeo(page:string){const item=pages[page];return item?{...item,index:true,canonical:siteOrigin+item.path}:{title:'Academy Portal | Livingworth Academy',description:'Secure access to the Livingworth Academy learner and staff portal.',path:'',index:false,canonical:null};}
export function applyPageSeo(page:string){
 const privateQuery=[...new URLSearchParams(location.search).keys()].some(key=>!(/^(utm_[a-z_]+|gclid|fbclid)$/.test(key)));
 const privateUrl=/^\/(portal|review|responsive-preview)(\/|$)/.test(location.pathname)||privateQuery;
 const data=pageSeo(privateUrl?'private':page);
 document.title=data.title;
 const meta=(attribute:string,key:string,value:string)=>{let el=document.head.querySelector(`meta[${attribute}="${key}"]`);if(!el){el=document.createElement('meta');el.setAttribute(attribute,key);document.head.append(el);}el.setAttribute('content',value);};
 meta('name','description',data.description);meta('name','robots',data.index?'index,follow,max-image-preview:large':'noindex,nofollow');
 meta('property','og:title',data.title);meta('property','og:description',data.description);meta('property','og:url',data.canonical||siteOrigin);meta('name','twitter:title',data.title);meta('name','twitter:description',data.description);
 let link=document.head.querySelector('link[rel="canonical"]');if(!data.canonical)link?.remove();else{if(!link){link=document.createElement('link');link.setAttribute('rel','canonical');document.head.append(link);}link.setAttribute('href',data.canonical);}
 if(!data.index)document.getElementById('academy-structured-data')?.remove();
}
