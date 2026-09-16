import { List, ListInput } from 'framework7-react';
import { useTheme } from '../../contexts/ThemeContext';

export default function ThemeSelect({ value, onChange, label = 'THEME' }) {
  const { themes } = useTheme();
  return (
    <List strongIos outlineIos inset>
      <ListInput
        label={label}
        type="select"
        value={value}
        onChange={event => onChange(event.target.value)}
      >
        {Object.entries(themes).map(([id, theme]) => (
          <option key={id} value={id}>{theme.label}</option>
        ))}
      </ListInput>
    </List>
  );
}