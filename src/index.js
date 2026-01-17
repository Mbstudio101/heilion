import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Hide splash screen once React is mounted
if (window.hideSplashScreen) {
  // Small delay to ensure React has rendered
  setTimeout(() => {
    window.hideSplashScreen();
  }, 100);
}
