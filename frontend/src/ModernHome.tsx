import { useState } from 'react';

type Navigate = (page: string) => void;
type Story = { id: number; title: string; content: string; studentName: string; storyType: string; featured?: boolean };

const tracks = [
  { number: '01', title: 'Systems foundation', tools: 'Linux · Bash · Git', copy: 'Build confidence at the command line, automate repeatable work and collaborate through professional source control.' },
  { number: '02', title: 'Cloud and automation', tools: 'AWS · Ansible · Terraform', copy: 'Provision secure cloud environments and turn manual infrastructure work into reliable, repeatable code.' },
  { number: '03', title: 'Modern delivery', tools: 'Docker · Kubernetes · CI/CD', copy: 'Package applications, orchestrate workloads and build delivery pipelines that move code safely to production.' },
  { number: '04', title: 'Production confidence', tools: 'Prometheus · Grafana · Capstone', copy: 'Observe real systems, troubleshoot failures and present an end-to-end engineering project with confidence.' },
];

export default function ModernHome({ navigate, stories }: { navigate: Navigate; stories: Story[] }) {
  const [openTrack, setOpenTrack] = useState(0);
  return <div className="modern-site">
    <header className="modern-nav">
      <a className="modern-logo" href="#top"><img src="/livingworth-logo.jpeg" alt="Livingworth Academy" /></a>
      <nav><a href="#experience">Experience</a><a href="#roadmap">Roadmap</a><a href="#outcomes">Outcomes</a></nav>
      <div><button className="modern-link" onClick={() => navigate('verify-certificate')}>Verify certificate</button><button className="modern-login" onClick={() => navigate('student-login')}>Log in</button><button className="modern-apply" onClick={() => navigate('register')}>Apply now <span>↗</span></button></div>
    </header>

    <main id="top">
      <section className="modern-hero">
        <div className="modern-hero-copy">
          <span className="modern-kicker">Live DevOps academy · 14 weeks</span>
          <h1>Learn the work.<br/><em>Build the proof.</em></h1>
          <p>A practical learning experience for people ready to understand modern infrastructure, ship real projects and grow into confident DevOps engineers.</p>
          <div className="modern-hero-actions"><button onClick={() => navigate('register')}>Join the next cohort <span>→</span></button><a href="#roadmap">View the learning path</a></div>
          <div className="modern-proof"><div><strong>42</strong><span>live class days</span></div><div><strong>10+</strong><span>industry tools</span></div><div><strong>1:1</strong><span>project feedback</span></div></div>
        </div>
        <div className="modern-hero-visual">
          <div className="modern-orbit"><span>Linux</span><span>AWS</span><span>Docker</span><span>K8s</span><b>LW</b></div>
          <article className="modern-now"><span>LIVE LEARNING</span><h3>Production delivery lab</h3><p>Friday · 8:00 PM WAT</p><div><i>JM</i><i>JO</i><i>DA</i><small>+9 learners</small></div></article>
          <article className="modern-progress"><header><span>Your roadmap</span><b>68%</b></header><div><i /></div><p>7 of 10 modules completed</p></article>
        </div>
      </section>

      <section className="modern-marquee"><span>LINUX</span><i>◆</i><span>GIT</span><i>◆</i><span>AWS</span><i>◆</i><span>TERRAFORM</span><i>◆</i><span>DOCKER</span><i>◆</i><span>KUBERNETES</span><i>◆</i><span>CI/CD</span></section>

      <section className="modern-experience" id="experience">
        <div className="modern-section-heading"><span>Designed for real learning</span><h2>More than watching.<br/>You learn by doing.</h2><p>Every part of the programme moves you from explanation to practice, feedback and evidence you can confidently discuss.</p></div>
        <div className="modern-bento">
          <article className="bento-large"><span>01 · LEARN LIVE</span><h3>See the thinking behind the tools.</h3><p>Ask questions, follow real demonstrations and understand why engineers choose one approach over another.</p><div className="terminal-card"><i>$</i> kubectl get pods <b>All systems healthy</b></div></article>
          <article className="bento-mint"><span>02 · BUILD</span><h3>Turn every topic into practical work.</h3><div className="skill-pills"><i>Bash scripts</i><i>Cloud servers</i><i>Pipelines</i><i>Containers</i></div></article>
          <article className="bento-gold"><span>03 · GET FEEDBACK</span><h3>Know what works—and what to improve.</h3><div className="feedback-score"><strong>86</strong><span>/100<br/>Great progress</span></div></article>
        </div>
      </section>

      <section className="modern-roadmap" id="roadmap">
        <div className="modern-roadmap-intro"><span>Your learning journey</span><h2>A clear path from foundations to production.</h2><p>Four connected stages. Each one builds the judgment and practical confidence needed for the next.</p><button onClick={() => navigate('register')}>Start your journey →</button></div>
        <div className="modern-track-list">{tracks.map((track,index)=><article key={track.number} className={openTrack===index?'open':''} onClick={()=>setOpenTrack(index)}><button aria-expanded={openTrack===index}><b>{track.number}</b><span><strong>{track.title}</strong><small>{track.tools}</small></span><i>{openTrack===index?'−':'+'}</i></button>{openTrack===index&&<p>{track.copy}</p>}</article>)}</div>
      </section>

      <section className="modern-outcomes" id="outcomes">
        <div><span>Graduate with evidence</span><h2>Your work becomes your story.</h2><p>Finish with practical projects, GitHub evidence and the confidence to explain how you approached real engineering problems.</p></div>
        <ol><li><b>01</b><span><strong>Cloud foundation</strong><small>Secure Linux infrastructure on AWS</small></span></li><li><b>02</b><span><strong>Automated infrastructure</strong><small>Terraform and Ansible delivery</small></span></li><li><b>03</b><span><strong>Container platform</strong><small>Docker and Kubernetes deployment</small></span></li><li><b>04</b><span><strong>End-to-end capstone</strong><small>CI/CD, monitoring and presentation</small></span></li></ol>
      </section>

      {stories.length>0&&<section className="modern-voices"><div className="modern-section-heading"><span>Learner voices</span><h2>Growth, in their own words.</h2></div><div>{stories.slice(0,3).map(story=><article key={story.id}><span>“</span><p>{story.content}</p><footer><b>{story.studentName}</b><small>{story.storyType.replaceAll('_',' ')}</small></footer></article>)}</div></section>}

      <section className="modern-final"><span>Applications are open</span><h2>Ready to build your<br/>DevOps future?</h2><p>Join the next Livingworth Academy cohort and turn curiosity into practical engineering confidence.</p><button onClick={() => navigate('register')}>Apply for the next cohort <b>↗</b></button></section>
    </main>
    <footer className="modern-footer"><a className="modern-logo" href="#top"><img src="/livingworth-logo.jpeg" alt="Livingworth Academy" /></a><p>Practical learning. Real engineering confidence.</p><div><button onClick={() => navigate('student-login')}>Student portal</button><button onClick={() => navigate('staff-login')}>Staff portal</button></div><small>© {new Date().getFullYear()} Livingworth Academy</small></footer>
  </div>;
}
