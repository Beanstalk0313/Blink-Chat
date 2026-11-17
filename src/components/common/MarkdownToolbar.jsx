import styles from './MarkdownToolbar.module.css';

// Markdown is already rendered by src/services/richText.jsx; this is the writing
// side of it. Each button wraps the current selection (or drops a placeholder in
// and selects it) and then restores the caret, so it never steals focus from
// the composer mid-sentence.
const FORMATS = [
  { id: 'bold', icon: 'format_bold', marker: '**', placeholder: 'bold', label: 'Bold' },
  { id: 'italic', icon: 'format_italic', marker: '*', placeholder: 'italic', label: 'Italic' },
  { id: 'strike', icon: 'strikethrough_s', marker: '~~', placeholder: 'struck', label: 'Strikethrough' },
  { id: 'code', icon: 'code', marker: '`', placeholder: 'code', label: 'Code' }
];

export default function MarkdownToolbar({ inputRef, value = '', onChange, disabled = false }) {
  const apply = format => {
    const input = inputRef?.current;
    if (!input || disabled) return;
    const start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? start;
    const selected = value.slice(start, end);
    const inner = selected || format.placeholder;
    const selectionStart = start + format.marker.length;
    const selectionEnd = selectionStart + inner.length;
    // Edit through the range API so the DOM value and the caret move together;
    // handing the resulting value to React then keeps the input controlled
    // without a second render fighting over the selection.
    input.focus();
    input.setRangeText(`${format.marker}${inner}${format.marker}`, start, end, 'select');
    input.setSelectionRange(selectionStart, selectionEnd);
    onChange(input.value);
  };

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Markdown formatting">
      {FORMATS.map(format => (
        <button
          key={format.id}
          type="button"
          className={styles.button}
          title={format.label}
          aria-label={format.label}
          // Keep the composer's selection alive when the button is pressed.
          onMouseDown={event => event.preventDefault()}
          onClick={() => apply(format)}
          disabled={disabled}
        >
          <span className="material-symbols-outlined">{format.icon}</span>
        </button>
      ))}
      <span className={styles.hint}>md</span>
    </div>
  );
}
