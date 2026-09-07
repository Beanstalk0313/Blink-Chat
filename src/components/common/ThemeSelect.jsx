import { useTheme } from '../../contexts/ThemeContext';

export default function ThemeSelect({ value, onChange, label = 'THEME' }) {
  const { themes } = useTheme();
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <span className="text-label-md">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ padding: '0.75rem', background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid var(--color-outline-variant)', borderRadius: 'var(--radius-sm)' }}>
        {Object.entries(themes).map(([id, theme]) => <option key={id} value={id}>{theme.label}</option>)}
      </select>
    </label>
  );
}
