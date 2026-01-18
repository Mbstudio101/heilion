// Update Notification Component - Shows update availability and progress
import React, { useState, useEffect } from 'react';
import './UpdateNotification.css';

function UpdateNotification() {
  const [updateState, setUpdateState] = useState({
    status: 'idle', // idle, checking, available, downloading, downloaded, error
    version: null,
    releaseNotes: null,
    progress: 0,
    message: null,
    error: null
  });

  useEffect(() => {
    // Check if electronAPI is available (only in Electron, not in browser)
    if (!window.electronAPI || typeof window.electronAPI.onUpdateStatus !== 'function') {
      // In development mode or browser, electronAPI might not be available
      console.debug('Update API not available (development mode or browser)');
      return;
    }

    // Listen for update events
    const handleUpdateStatus = (data) => {
      setUpdateState(prev => ({
        ...prev,
        status: data.status,
        message: data.message
      }));
    };

    const handleUpdateAvailable = (data) => {
      setUpdateState({
        status: 'available',
        version: data.version,
        releaseNotes: data.releaseNotes,
        message: `Update ${data.version} is available!`,
        progress: 0,
        error: null
      });
    };

    const handleUpdateDownloadProgress = (data) => {
      setUpdateState(prev => ({
        ...prev,
        status: 'downloading',
        progress: data.percent,
        message: `Downloading update... ${data.percent.toFixed(0)}%`
      }));
    };

    const handleUpdateDownloaded = (data) => {
      setUpdateState({
        status: 'downloaded',
        version: data.version,
        releaseNotes: data.releaseNotes,
        message: `Update ${data.version} is ready to install!`,
        progress: 100,
        error: null
      });
    };

    const handleUpdateError = (data) => {
      setUpdateState(prev => ({
        ...prev,
        status: 'error',
        error: data.message,
        message: `Update error: ${data.message}`
      }));
    };

    // Register listeners
    window.electronAPI.onUpdateStatus(handleUpdateStatus);
    window.electronAPI.onUpdateAvailable(handleUpdateAvailable);
    window.electronAPI.onUpdateDownloadProgress(handleUpdateDownloadProgress);
    window.electronAPI.onUpdateDownloaded(handleUpdateDownloaded);
    window.electronAPI.onUpdateError(handleUpdateError);

    // Cleanup
    return () => {
      if (window.electronAPI && typeof window.electronAPI.removeUpdateListeners === 'function') {
        window.electronAPI.removeUpdateListeners();
      }
    };
  }, []);

  const handleDownload = async () => {
    if (!window.electronAPI || typeof window.electronAPI.downloadUpdate !== 'function') {
      setUpdateState(prev => ({
        ...prev,
        status: 'error',
        error: 'Update API not available'
      }));
      return;
    }
    
    try {
      setUpdateState(prev => ({ ...prev, status: 'downloading', progress: 0 }));
      await window.electronAPI.downloadUpdate();
    } catch (error) {
      setUpdateState(prev => ({
        ...prev,
        status: 'error',
        error: error.message || 'Failed to start download'
      }));
    }
  };

  const handleInstall = async () => {
    if (!window.electronAPI || typeof window.electronAPI.installUpdate !== 'function') {
      setUpdateState(prev => ({
        ...prev,
        status: 'error',
        error: 'Update API not available'
      }));
      return;
    }
    
    try {
      await window.electronAPI.installUpdate();
    } catch (error) {
      setUpdateState(prev => ({
        ...prev,
        status: 'error',
        error: error.message || 'Failed to install update'
      }));
    }
  };

  const handleDismiss = () => {
    setUpdateState({
      status: 'idle',
      version: null,
      releaseNotes: null,
      progress: 0,
      message: null,
      error: null
    });
  };

  // Don't render if no update info
  if (updateState.status === 'idle' || updateState.status === 'checking') {
    return null;
  }

  return (
    <div className={`update-notification ${updateState.status}`}>
      <div className="update-content">
        {updateState.status === 'available' && (
          <>
            <div className="update-icon">🔔</div>
            <div className="update-text">
              <div className="update-title">Update Available</div>
              <div className="update-message">{updateState.message}</div>
              {updateState.releaseNotes && (
                <div className="update-notes">{updateState.releaseNotes}</div>
              )}
            </div>
            <div className="update-actions">
              <button className="update-btn update-btn-primary" onClick={handleDownload}>
                Download Update
              </button>
              <button className="update-btn update-btn-secondary" onClick={handleDismiss}>
                Later
              </button>
            </div>
          </>
        )}

        {updateState.status === 'downloading' && (
          <>
            <div className="update-icon">⬇️</div>
            <div className="update-text">
              <div className="update-title">Downloading Update</div>
              <div className="update-message">{updateState.message}</div>
              <div className="update-progress-bar">
                <div 
                  className="update-progress-fill" 
                  style={{ width: `${updateState.progress}%` }}
                />
              </div>
            </div>
          </>
        )}

        {updateState.status === 'downloaded' && (
          <>
            <div className="update-icon">✅</div>
            <div className="update-text">
              <div className="update-title">Update Ready</div>
              <div className="update-message">{updateState.message}</div>
              {updateState.releaseNotes && (
                <div className="update-notes">{updateState.releaseNotes}</div>
              )}
            </div>
            <div className="update-actions">
              <button className="update-btn update-btn-primary" onClick={handleInstall}>
                Install & Restart
              </button>
              <button className="update-btn update-btn-secondary" onClick={handleDismiss}>
                Later
              </button>
            </div>
          </>
        )}

        {updateState.status === 'error' && (
          <>
            <div className="update-icon">⚠️</div>
            <div className="update-text">
              <div className="update-title">Update Error</div>
              <div className="update-message">{updateState.error || updateState.message}</div>
            </div>
            <div className="update-actions">
              <button className="update-btn update-btn-secondary" onClick={handleDismiss}>
                Dismiss
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default UpdateNotification;
