// Update Manager - Handles auto-update functionality
const { autoUpdater } = require('electron-updater');
const { dialog } = require('electron');

let mainWindow = null;
let updateCheckInterval = null;

// Configure auto-updater
autoUpdater.setAutoDownload(false); // Don't auto-download, let user choose
autoUpdater.setAutoInstallOnAppQuit(true); // Auto-install on app quit after download

// Update events
autoUpdater.on('checking-for-update', () => {
  console.log('Checking for updates...');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', { 
      status: 'checking',
      message: 'Checking for updates...'
    });
  }
});

autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info.version);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes || 'A new version is available'
    });
  }
});

autoUpdater.on('update-not-available', (info) => {
  console.log('Update not available. Current version is latest.');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', {
      status: 'latest',
      message: 'You are using the latest version'
    });
  }
});

autoUpdater.on('error', (error) => {
  console.error('Update error:', error);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-error', {
      message: error.message || 'Update check failed'
    });
  }
});

autoUpdater.on('download-progress', (progressObj) => {
  const message = `Download speed: ${Math.round(progressObj.bytesPerSecond / 1024)} KB/s - ${progressObj.percent.toFixed(0)}%`;
  console.log(message);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-download-progress', {
      percent: progressObj.percent,
      transferred: progressObj.transferred,
      total: progressObj.total,
      bytesPerSecond: progressObj.bytesPerSecond
    });
  }
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded:', info.version);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-downloaded', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes
    });
  }
});

function setMainWindow(window) {
  mainWindow = window;
}

function checkForUpdates(showDialog = false) {
  if (showDialog && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', {
      status: 'checking',
      message: 'Checking for updates...'
    });
  }
  
  autoUpdater.checkForUpdates().catch((error) => {
    console.error('Failed to check for updates:', error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error', {
        message: error.message || 'Failed to check for updates'
      });
    }
  });
}

function downloadUpdate() {
  autoUpdater.downloadUpdate().catch((error) => {
    console.error('Failed to download update:', error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error', {
        message: error.message || 'Failed to download update'
      });
    }
  });
}

function quitAndInstall() {
  autoUpdater.quitAndInstall(false, true);
}

function startPeriodicUpdateCheck(intervalHours = 24) {
  // Check for updates on startup
  checkForUpdates();
  
  // Check periodically (default: every 24 hours)
  const intervalMs = intervalHours * 60 * 60 * 1000;
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
  }
  
  updateCheckInterval = setInterval(() => {
    checkForUpdates();
  }, intervalMs);
  
  console.log(`Started periodic update check (every ${intervalHours} hours)`);
}

function stopPeriodicUpdateCheck() {
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
  }
}

function getCurrentVersion() {
  return autoUpdater.currentVersion.version;
}

module.exports = {
  setMainWindow,
  checkForUpdates,
  downloadUpdate,
  quitAndInstall,
  startPeriodicUpdateCheck,
  stopPeriodicUpdateCheck,
  getCurrentVersion
};
