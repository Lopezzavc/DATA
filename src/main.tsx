import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { TorneoProvider } from './context/TorneoContext'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <TorneoProvider>
        <App />
      </TorneoProvider>
    </BrowserRouter>
  </React.StrictMode>
)