import { openLeftPanel } from '../navigation';

// Standard navbar hamburger for every native page: a plain <button> (not a
// Framework7 Link, whose click machinery proved unreliable in production
// builds) that opens the app-level React sidebar. Using one component
// everywhere keeps the style and position consistent across pages.
//
// When the Navbar uses the `title` prop, pass this as <MenuButton slot="left" />
// (F7's React navbar only places the left slot BEFORE the title; plain NavLeft
// children end up after it, which pushed the button off the top-left).
export default function MenuButton(props) {
  return (
    <button type="button" className="n-menu-btn" onClick={openLeftPanel} aria-label="Open menu" {...props}>
      <span className="material-symbols-outlined">menu</span>
    </button>
  );
}