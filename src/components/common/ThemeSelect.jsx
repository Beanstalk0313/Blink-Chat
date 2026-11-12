import Dropdown from './Dropdown';
import { useTheme } from '../../contexts/ThemeContext';

// Theme picker for the web app. It used to be a Framework7 list input, which
// only existed for Blink Native; it now uses Blink's own dropdown with the same
// value/onChange contract.
export default function ThemeSelect({ value, onChange, label = 'THEME' }) {
  const { themes } = useTheme();
  const options = Object.entries(themes).map(([id, theme]) => ({ value: id, label: theme.label }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      {label ? <span className="text-label-sm text-tertiary">{label}</span> : null}
      <Dropdown value={value} onChange={onChange} options={options} ariaLabel={label || 'Theme'} />
    </div>
  );
}
