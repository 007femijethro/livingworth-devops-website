import {renderToString} from 'react-dom/server';
import ModernHome from './ModernHome';
export {pageSeo,siteOrigin} from './seo';
export function renderPublicPage(page:string){
 if(page==='home')return renderToString(<ModernHome navigate={()=>{}} stories={[]} staticPreview/>);
 return renderToString(<main className="intake-intro"><a href="/">Livingworth Academy</a><h1>Apply for DevOps training</h1><p>Learn Linux, AWS, Docker, Kubernetes, Terraform and CI/CD through practical projects and mentor guidance. Choose online, physical or hybrid learning.</p><p>The application form loads with JavaScript. Applications are reviewed before student portal access is activated.</p><noscript>Please enable JavaScript to use the application form. You can call 08066483401 or 08103961110 for intake information.</noscript><a href="/">Explore the programme</a></main>);
}
