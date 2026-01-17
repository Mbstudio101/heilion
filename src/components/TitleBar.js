import React, { useState, useEffect } from 'react';
import './TitleBar.css';

function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    // Check initial maximized state
    if (window.electronAPI?.windowIsMaximized) {
      window.electronAPI.windowIsMaximized().then(setIsMaximized).catch(() => {});
    }

    // Listen for window maximize/unmaximize events from main process
    const handleMaximized = (maximized) => {
      setIsMaximized(maximized);
    };

    // Use Electron IPC to listen for window state changes
    if (window.electronAPI?.onWindowMaximized) {
      window.electronAPI.onWindowMaximized(handleMaximized);
    }

    // Fallback: check periodically if IPC events not available
    let interval = null;
    if (!window.electronAPI?.onWindowMaximized) {
      const checkMaximized = async () => {
        if (window.electronAPI?.windowIsMaximized) {
          try {
            const maximized = await window.electronAPI.windowIsMaximized();
            setIsMaximized(maximized);
          } catch (e) {
            // Ignore errors
          }
        }
      };
      interval = setInterval(checkMaximized, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
      // Cleanup IPC listener if it exists
      if (window.electronAPI?.removeWindowMaximizedListener) {
        window.electronAPI.removeWindowMaximizedListener(handleMaximized);
      }
    };
  }, []);

  const handleMinimize = () => {
    if (window.electronAPI?.windowMinimize) {
      window.electronAPI.windowMinimize();
    }
  };

  const handleMaximize = async () => {
    if (window.electronAPI?.windowMaximize) {
      await window.electronAPI.windowMaximize();
      const maximized = await window.electronAPI.windowIsMaximized();
      setIsMaximized(maximized);
    }
  };

  const handleClose = () => {
    if (window.electronAPI?.windowClose) {
      window.electronAPI.windowClose();
    }
  };

  // Detect platform
  const platform = navigator.platform.toLowerCase().includes('mac') ? 'darwin' : 'win32';

  return (
    <div className="title-bar" data-platform={platform}>
      <div className="title-bar-drag-region">
        <div className="title-bar-title">Heilion</div>
      </div>
      <div className="title-bar-controls">
        <button 
          className="title-bar-button minimize" 
          onClick={handleMinimize}
          title="Minimize"
        >
          <span>−</span>
        </button>
        <button 
          className="title-bar-button maximize" 
          onClick={handleMaximize}
          title={isMaximized ? "Restore Down" : "Maximize"}
        >
          <span>{isMaximized ? '⧉' : '□'}</span>
        </button>
        <button 
          className="title-bar-button close" 
          onClick={handleClose}
          title="Close"
        >
          <span>×</span>
        </button>
      </div>
    </div>
  );
}

export default TitleBar;
