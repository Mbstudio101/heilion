import React, { useState } from 'react';
import { importDeckFromPPTX } from '../utils/deckManager';
import './PPTXImporter.css';

function PPTXImporter({ onImportComplete, onCancel }) {
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState('');

  const handleImportClick = async () => {
    setImporting(true);
    setProgress('Reading PPTX file...');
    
    try {
      setProgress('Opening file dialog...');
      const result = await importDeckFromPPTX();
      
      if (!result.success) {
        throw new Error(result.error || 'Import failed');
      }
      
      setProgress('Parsing slides and generating study pack...');
      // importDeckFromPPTX already handles everything: parsing, saving, building study pack, generating questions
      
      setProgress('Import complete!');
      setTimeout(() => {
        onImportComplete(result.deckId);
      }, 500);
    } catch (error) {
      console.error('Import failed:', error);
      setProgress(`Import failed: ${error.message}`);
    } finally {
      // Don't set importing to false immediately - wait for onImportComplete
      setTimeout(() => {
        setImporting(false);
      }, 500);
    }
  };

  return (
    <div className="pptx-importer-overlay" onClick={onCancel}>
      <div className="pptx-importer" onClick={(e) => e.stopPropagation()}>
        <h2>Import PPTX File</h2>
        
        {!importing ? (
          <div>
            <button onClick={handleImportClick} className="import-btn-large">
              Select PPTX File
            </button>
            <button onClick={onCancel} className="cancel-btn">Cancel</button>
          </div>
        ) : (
          <div className="import-progress">
            <div className="spinner" />
            <p>{progress}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default PPTXImporter;
