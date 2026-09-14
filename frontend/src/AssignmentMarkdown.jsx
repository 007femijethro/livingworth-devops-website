import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function AssignmentMarkdown({ children }) {
  return <div className="assignment-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ img: ({ alt }) => <span>{alt}</span> }}>{String(children || '')}</ReactMarkdown></div>;
}

export function AssignmentInstructions({ defaultValue = '' }) {
  const [text, setText] = useState(defaultValue);
  return <div className="assignment-instructions-editor"><label>Instructions<textarea name="instructions" rows="10" defaultValue={defaultValue} onChange={event => setText(event.target.value)} required /></label><small>Formatting: ## Heading · **bold** · *italic* · - list item. Use triple backticks for code blocks.</small><details className="assignment-brief"><summary>Preview formatting</summary><AssignmentMarkdown>{text}</AssignmentMarkdown></details></div>;
}
