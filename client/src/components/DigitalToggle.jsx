import { useDigitalFilter } from '../context/DigitalFilterContext.jsx';

/**
 * Filter-bar button that hides digital-only (Pokémon TCG Pocket) sets and cards.
 */
export default function DigitalToggle() {
  const { hideDigital, toggleHideDigital } = useDigitalFilter();
  return (
    <button
      type="button"
      className={`filter-btn digital-toggle${hideDigital ? ' active' : ''}`}
      onClick={toggleHideDigital}
      aria-pressed={hideDigital}
      title={hideDigital ? 'Digital-only TCG Pocket cards are hidden' : 'Hide digital-only TCG Pocket cards'}
    >
      📱 {hideDigital ? 'TCG Pocket hidden' : 'Hide TCG Pocket'}
    </button>
  );
}
