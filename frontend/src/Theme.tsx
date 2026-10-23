import {createContext, useContext, useEffect, useState, type ReactNode} from 'react';

type Preference = 'light' | 'dark' | 'system';
const key = 'lw_appearance';
function readPreference(): Preference {
  try { const saved = localStorage.getItem(key); if (saved === 'light' || saved === 'dark') return saved; } catch {}
  return 'system';
}
const ThemeContext = createContext({preference: 'system' as Preference, dark: false, setPreference: (_value: Preference) => {}});
export function ThemeProvider({children}: {children: ReactNode}) {
  const [preference, updatePreference] = useState(readPreference);
  const [deviceDark, setDeviceDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const dark = preference === 'dark' || (preference === 'system' && deviceDark);
  const setPreference = (value: Preference) => {
    updatePreference(value);
    try { localStorage.setItem(key, value); } catch {}
  };
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const changed = () => setDeviceDark(media.matches);
    media.addEventListener('change', changed);
    const sync = (event: StorageEvent) => { if (event.key === key || event.key === null) updatePreference(readPreference()); };
    window.addEventListener('storage', sync);
    return () => { media.removeEventListener('change', changed); window.removeEventListener('storage', sync); };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#101b2b' : '#ffffff');
  }, [dark]);
  return <ThemeContext.Provider value={{preference, dark, setPreference}}>{children}</ThemeContext.Provider>;
}
export function ThemeToggle({standalone = false}: {standalone?: boolean}) {
  const {dark, setPreference} = useContext(ThemeContext);
  return <button type="button" className={`theme-toggle${standalone ? ' theme-toggle-standalone' : ''}`} onClick={() => setPreference(dark ? 'light' : 'dark')} aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`} title={`Switch to ${dark ? 'light' : 'dark'} mode`}><span aria-hidden="true">{dark ? '☀' : '☾'}</span><span className="theme-toggle-label">{dark ? 'Light mode' : 'Dark mode'}</span></button>;
}
export function AppearanceSettings() {
  const {preference, setPreference} = useContext(ThemeContext);
  return <article className="about-card appearance-settings"><h2>Appearance</h2><p>Choose how the academy looks on this device. Your preference is remembered for your next visit.</p><div className="appearance-options" role="group" aria-label="Colour mode">{(['light', 'dark', 'system'] as const).map(value => <button type="button" key={value} aria-pressed={preference === value} onClick={() => setPreference(value)}><span aria-hidden="true">{value === 'light' ? '☀' : value === 'dark' ? '☾' : '◐'}</span>{value === 'system' ? 'Follow device' : `${value[0].toUpperCase()}${value.slice(1)} mode`}</button>)}</div></article>;
}
