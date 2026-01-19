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
  const isMac = platform === 'darwin';

  // On macOS, traffic lights go on the left
  if (isMac) {
    return (
      <div className="title-bar mac-title-bar" data-platform={platform}>
        {/* macOS: Traffic lights on the left */}
        <div className="title-bar-controls mac-traffic-lights">
          <button 
            className="title-bar-button mac-button close" 
            onClick={handleClose}
            title="Close"
          >
            <svg width="6" height="6" viewBox="0 0 6 6" fill="none">
              <circle cx="3" cy="3" r="3" fill="#ff5f57"/>
            </svg>
          </button>
          <button 
            className="title-bar-button mac-button minimize" 
            onClick={handleMinimize}
            title="Minimize"
          >
            <svg width="6" height="6" viewBox="0 0 6 6" fill="none">
              <circle cx="3" cy="3" r="3" fill="#ffbd2e"/>
            </svg>
          </button>
          <button 
            className="title-bar-button mac-button maximize" 
            onClick={handleMaximize}
            title={isMaximized ? "Exit Full Screen" : "Enter Full Screen"}
          >
            <svg width="6" height="6" viewBox="0 0 6 6" fill="none">
              <circle cx="3" cy="3" r="3" fill="#28ca42"/>
            </svg>
          </button>
        </div>
        {/* Drag region with title */}
        <div className="title-bar-drag-region">
          <div className="title-bar-title">Heilion</div>
        </div>
      </div>
    );
  }

  // Windows/Linux: Controls on the right
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
