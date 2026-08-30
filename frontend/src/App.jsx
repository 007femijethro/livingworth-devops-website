import { useEffect, useState } from 'react';

export default function App() {
  const [courses, setCourses] = useState([]);
  const [status, setStatus] = useState('');

  useEffect(() => {
    fetch('/api/courses')
      .then((response) => {
        if (!response.ok) throw new Error('Unable to load courses');
        return response.json();
      })
      .then(setCourses)
      .catch(() => setStatus('Courses will be available shortly.'));
  }, []);

  async function submitEnquiry(event) {
    event.preventDefault();
    setStatus('Sending…');
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    try {
      const response = await fetch('/api/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setStatus(data.message);
      form.reset();
    } catch (error) {
      setStatus(error.message || 'Please try again.');
    }
  }

  return (
    <>
      <header className="nav">
        <a className="brand" href="#top"><span>LW</span> Livingworth Academy</a>
        <nav aria-label="Main navigation">
          <a href="#courses">Courses</a><a href="#about">About</a><a href="#contact">Contact</a>
        </nav>
      </header>
      <main id="top">
        <section className="hero">
          <p className="eyebrow">Learn. Build. Lead.</p>
          <h1>Practical technology skills for tomorrow’s builders.</h1>
          <p className="lead">Livingworth Academy turns complex technology into clear, hands-on learning that prepares you for real opportunities.</p>
          <div className="actions"><a className="button primary" href="#courses">Explore courses</a><a className="button secondary" href="#contact">Talk to us</a></div>
          <div className="stats"><div><strong>3</strong><span>Focused programmes</span></div><div><strong>Live</strong><span>Instructor-led learning</span></div><div><strong>Real</strong><span>Practical projects</span></div></div>
        </section>

        <section id="courses" className="section">
          <p className="eyebrow">Programmes</p><h2>Start where you are. Grow with purpose.</h2>
          <div className="grid">
            {courses.map((course) => <article className="card" key={course.id}><span className="pill">{course.level}</span><h3>{course.title}</h3><p>{course.description}</p><small>{course.duration}</small></article>)}
          </div>
        </section>

        <section id="about" className="section split">
          <div><p className="eyebrow">Why Livingworth</p><h2>Training built around understanding, not memorising.</h2></div>
          <p>We combine clear explanations, guided practice and collaborative sessions. Learners leave each class knowing what they learned, why it matters and how to apply it.</p>
        </section>

        <section id="contact" className="section contact">
          <div><p className="eyebrow">Join the journey</p><h2>Ready to learn with us?</h2><p>Send an enquiry and the academy team will contact you.</p></div>
          <form onSubmit={submitEnquiry}>
            <label>Name<input name="name" required /></label>
            <label>Email<input name="email" type="email" required /></label>
            <label>Message<textarea name="message" rows="4" required /></label>
            <button className="button primary" type="submit">Send enquiry</button>
            <p className="form-status" role="status">{status}</p>
          </form>
        </section>
      </main>
      <footer>© {new Date().getFullYear()} Livingworth Academy. Learn with purpose.</footer>
    </>
  );
}

