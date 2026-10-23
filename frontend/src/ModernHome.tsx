import { BrandLogo } from './Theme';
import { useState } from 'react';
import './homepage-refresh.css';

type Navigate = (page: string) => void;
type Story = { id: number; title: string; content: string; studentName: string; storyType: string; featured?: boolean };

const tracks = [
  { number: '01', title: 'Systems foundation', tools: 'Linux · Bash · Git', copy: 'Build confidence at the command line, automate repeatable work and collaborate through professional source control.' },
  { number: '02', title: 'Cloud and automation', tools: 'AWS · Ansible · Terraform', copy: 'Provision secure cloud environments and turn manual infrastructure work into reliable, repeatable code.' },
  { number: '03', title: 'Modern delivery', tools: 'Docker · Kubernetes · CI/CD', copy: 'Package applications, orchestrate workloads and build delivery pipelines that move code safely to production.' },
  { number: '04', title: 'Production confidence', tools: 'Prometheus · Grafana · Capstone', copy: 'Observe real systems, troubleshoot failures and present an end-to-end engineering project with confidence.' },
];

export default function ModernHome({ navigate, stories }: { navigate: Navigate; stories: Story[] }) {
  const [openTrack, setOpenTrack] = useState<number | null>(null);
  return <div className="modern-site">
    <header className="modern-nav">
      <a className="modern-logo" href="#top"><BrandLogo alt="Livingworth Academy" /></a>
      <nav><a href="/portfolio/">Your mentor</a><a href="#experience">Experience</a><a href="#roadmap">Roadmap</a></nav>
      <div><button className="modern-link" onClick={() => navigate('verify-certificate')}>Verify certificate</button><button className="modern-login" onClick={() => navigate('student-login')}>Log in</button><button className="modern-apply" onClick={() => navigate('register')}>Apply now <span>↗</span></button></div>
    </header>

    <main id="top">
      <section className="modern-hero">
        <div className="modern-hero-copy">
          <span className="modern-kicker">Live DevOps academy · 4 months</span>
          <h1>Learn the work.<br/><em>Build the proof.</em></h1>
          <p>A practical learning experience for people ready to understand modern infrastructure, ship real projects and grow into confident DevOps engineers.</p>
          <div className="modern-hero-actions"><button onClick={() => navigate('register')}>Join the next cohort <span>→</span></button><a href="#mentor">Meet your mentor ↓</a></div>
          <div className="modern-proof"><div><strong>3</strong><span>classes each week</span></div><div><strong>10+</strong><span>industry tools</span></div><div><strong>1:1</strong><span>project feedback</span></div></div>
        </div>
        <div className="modern-hero-visual">
          <figure className="home-lab"><img src="/devops-mentor-lab.jpg" alt="DevOps learning lab with hands-on engineering guidance" /><figcaption><span>THE LIVINGWORTH EXPERIENCE</span><strong>Learn together.<br/>Build with confidence.</strong><a href="#experience">Explore the programme ↗</a></figcaption></figure>
        </div>
      </section>

      <section className="modern-facts" aria-label="Programme schedule">
        <article><strong>4 Months</strong><span>Duration</span></article>
        <article><strong>Physical / Online</strong><span>Classes</span></article>
        <article className="modern-facts-cohorts"><strong>Weekday / Weekend</strong><span><b>Weekdays:</b> Mon, Wed, Fri<br/><b>Weekends:</b> Fri, Sat, Sun</span></article>
        <article><strong>7 pm – 9 pm</strong><span>Time · WAT</span></article>
      </section>

      <section className="modern-marquee"><span>LINUX</span><i>◆</i><span>GIT</span><i>◆</i><span>AWS</span><i>◆</i><span>TERRAFORM</span><i>◆</i><span>DOCKER</span><i>◆</i><span>KUBERNETES</span><i>◆</i><span>CI/CD</span></section>

      <section className="home-mentor" id="mentor" aria-labelledby="mentor-heading">
        <div className="home-mentor-identity"><span className="modern-kicker">Meet your mentor</span><a href="/portfolio/" className="home-mentor-portrait" aria-label="View Jethro F.M’s portfolio"><img src="/portfolio/jethro-portrait.webp" alt="Jethro F.M, DevOps engineer and lead mentor" loading="lazy" width="240" height="300"/></a><h2 id="mentor-heading"><a href="/portfolio/">Jethro F.M</a></h2><p><a href="/portfolio/">Lead DevOps Mentor<br/>Managing Director</a></p><a href="/portfolio/" className="home-portfolio-link">View my full portfolio ↗</a></div>
        <div className="home-mentor-copy"><span>Practical experience. Personal guidance.</span><h3>Understand the tools.<br/>Learn the thinking.</h3><p>The programme is led with practical engineering experience, simple explanations and live troubleshooting. Students learn not only which commands to run, but how to reason through failures, communicate technical decisions and deliver reliable systems.</p><p>From your first Linux commands to your final project, live demonstrations and feedback help you turn each lesson into work you can explain with confidence.</p><ul><li>Cloud &amp; infrastructure</li><li>CI/CD &amp; automation</li><li>Containers &amp; orchestration</li><li>Production troubleshooting</li></ul></div>
      </section>

      <section className="home-learning-loop" aria-label="How learning works"><div><span>01</span><h3>Join the live class</h3><p>Follow demonstrations and ask questions as you learn.</p></div><div><span>02</span><h3>Put it into practice</h3><p>Apply the lesson through quizzes, assignments and projects.</p></div><div><span>03</span><h3>Improve with feedback</h3><p>Track your progress and build on what you’ve learned.</p></div></section>

      <section className="modern-experience" id="experience">
        <div className="modern-section-heading"><span>Designed for real learning</span><h2>More than watching.<br/>You learn by doing.</h2><p>Every part of the programme moves you from explanation to practice, feedback and evidence you can confidently discuss.</p></div>
        <div className="modern-bento">
          <article className="bento-large"><span>01 · LEARN LIVE</span><h3>See the thinking behind the tools.</h3><p>Ask questions, follow real demonstrations and understand why engineers choose one approach over another.</p><div className="terminal-card"><i>$</i> kubectl get pods <b>All systems healthy</b></div></article>
          <article className="bento-mint"><span>02 · BUILD</span><h3>Turn every topic into practical work.</h3><div className="skill-pills"><i>Bash scripts</i><i>Cloud servers</i><i>Pipelines</i><i>Containers</i></div></article>
          <article className="bento-gold"><span>03 · GET FEEDBACK</span><h3>Know what works—and what to improve.</h3><div className="feedback-score"><strong>86</strong><span>/100<br/>Great progress</span></div></article>
        </div>
      </section>

      <section className="modern-benefits" aria-labelledby="benefits-heading">
        <div className="modern-benefits-intro">
          <span>Why learn with Livingworth</span>
          <h2 id="benefits-heading">Training benefits</h2>
          <p>Build practical DevOps skills with guided teaching, real projects and support from your mentor.</p>
        </div>
        <ul>
          <li><span aria-hidden="true">✓</span>Beginner-friendly, step-by-step lessons</li>
          <li><span aria-hidden="true">✓</span>Hands-on labs using industry tools</li>
          <li><span aria-hidden="true">✓</span>Physical or online class options</li>
          <li><span aria-hidden="true">✓</span>Weekday and weekend cohorts</li>
          <li><span aria-hidden="true">✓</span>Live mentor guidance and troubleshooting</li>
          <li><span aria-hidden="true">✓</span>Assignments with feedback</li>
          <li><span aria-hidden="true">✓</span>GitHub portfolio and capstone project</li>
          <li><span aria-hidden="true">✓</span>Certificate when completion requirements are met</li>
        </ul>
      </section>

      <section className="modern-roadmap" id="roadmap">
        <div className="modern-roadmap-intro"><span>Your learning journey</span><h2>A clear path from foundations to production.</h2><p>Four connected stages. Each one builds the judgment and practical confidence needed for the next.</p><button onClick={() => navigate('register')}>Start your journey →</button></div>
        <div className="modern-track-list">{tracks.map((track,index)=><article key={track.number} className={openTrack===index?'open':''}><button aria-expanded={openTrack===index} aria-controls={`track-${track.number}`} onClick={()=>setOpenTrack(openTrack===index?null:index)}><b>{track.number}</b><span><strong>{track.title}</strong><small>{track.tools}</small></span><i aria-hidden="true">{openTrack===index?'−':'+'}</i></button>{openTrack===index&&<p id={`track-${track.number}`}>{track.copy}</p>}</article>)}</div>
      </section>

      <section className="modern-outcomes" id="outcomes">
        <div><span>Graduate with evidence</span><h2>Your work becomes your story.</h2><p>Finish with practical projects, GitHub evidence and the confidence to explain how you approached real engineering problems.</p></div>
        <ol><li><b>01</b><span><strong>Cloud foundation</strong><small>Secure Linux infrastructure on AWS</small></span></li><li><b>02</b><span><strong>Automated infrastructure</strong><small>Terraform and Ansible delivery</small></span></li><li><b>03</b><span><strong>Container platform</strong><small>Docker and Kubernetes deployment</small></span></li><li><b>04</b><span><strong>End-to-end capstone</strong><small>CI/CD, monitoring and presentation</small></span></li></ol>
      </section>

      {stories.length>0&&<section className="modern-voices"><div className="modern-section-heading"><span>Learner voices</span><h2>Growth, in their own words.</h2></div><div>{stories.slice(0,3).map(story=><article key={story.id}><span>“</span><p>{story.content}</p><footer><b>{story.studentName}</b><small>{story.storyType.replaceAll('_',' ')}</small></footer></article>)}</div></section>}

      <section className="modern-final"><span>Applications are open</span><h2>Ready to build your<br/>DevOps future?</h2><p>Join the next Livingworth Academy cohort and turn curiosity into practical engineering confidence.</p><button onClick={() => navigate('register')}>Apply for the next cohort <b>↗</b></button></section>
    </main>
    <footer className="modern-footer"><a className="modern-logo" href="#top"><BrandLogo alt="Livingworth Academy" /></a><p>Practical learning. Real engineering confidence.</p><div><button onClick={() => navigate('student-login')}>Student portal</button><button onClick={() => navigate('staff-login')}>Staff portal</button></div><small>© {new Date().getFullYear()} Livingworth Academy</small></footer>
  </div>;
}
