/**
 * Toggle pill that switches between the standard EarthGlobe and HoloEarth views.
 *
 * Layout: [ globe icon ] [ thumb ] [ holo icon ]
 * The `holo-active` class shifts the thumb right and brightens the holo icon
 * so it's obvious which mode is current at a glance.
 */
import worldwideIcon from '../../assets/icons/worldwide_icon.png'
import hologramIcon  from '../../assets/icons/hologram_earth_icon_v2.png'

export default function ViewToggle({ isHolo, onClick }) {
  return (
    <button
      className={`view-toggle${isHolo ? ' holo-active' : ''}`}
      onClick={onClick}
      aria-label="Toggle view"
    >
      <span className="toggle-side toggle-side-left">
        <img src={hologramIcon} alt="Hologram" className="toggle-img" />
      </span>
      <span className="toggle-thumb" />
      <span className="toggle-side toggle-side-right">
        <img src={worldwideIcon} alt="Standard" className="toggle-img" />
      </span>
    </button>
  )
}
