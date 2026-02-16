import './index.css'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { applyThemePreference, getStoredThemePreference } from './lib/themePreference'

applyThemePreference(getStoredThemePreference())

const root = createRoot(document.getElementById('root')!)
root.render(<App />)
