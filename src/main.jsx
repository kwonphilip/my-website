/**
 * Application entry point. Mounts the React tree into the #root div.
 *
 * StrictMode is intentional for development: it double-invokes component
 * functions and effects to surface side-effect bugs. Both EarthGlobe and
 * HoloEarth guard against this with cancelled-flag patterns so their Three.js
 * scenes aren't built twice. StrictMode is a no-op in production builds.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
