import { useState } from 'react';

export function UploadSlots({ defaultValue = [] }) {
  const [slots, setSlots] = useState(defaultValue);
  return <fieldset className="assignment-upload"><legend>Requested files</legend>
    <p>Choose the files you want students to provide and name each one. Students may submit before every file is attached. Every file has a 15 MB limit.</p>
    <label>Number of requested files<select value={slots.length} onChange={e => {
      const count = Number(e.target.value);
      setSlots(previous => Array.from({ length: count }, (_, i) => previous[i] || { id: `slot-${Date.now()}-${i}`, label: '' }));
    }}>{[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n === 0 ? 'No named files — optional uploads or project link' : n}</option>)}</select></label>
    {slots.map((slot, i) => <label key={slot.id}>File {i + 1} name<input value={slot.label} required maxLength={120} placeholder="e.g. Bash script, Terminal screenshot, Report" onChange={e => setSlots(slots.map(s => s.id === slot.id ? { ...s, label: e.target.value } : s))} /></label>)}
    <input type="hidden" name="uploadSlots" value={JSON.stringify(slots)} />
  </fieldset>;
}
