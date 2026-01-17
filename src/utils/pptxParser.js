import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';

export async function parsePPTXFromBuffer(fileData) {
  try {
    // fileData is an array of bytes from main process
    const uint8Array = new Uint8Array(fileData);
    const arrayBuffer = uint8Array.buffer;
    const zip = await JSZip.loadAsync(arrayBuffer);
    
    return parseZipContent(zip);
  } catch (error) {
    console.error('Failed to parse PPTX from buffer:', error);
    return { success: false, error: error.message };
  }
}

export async function parsePPTX(filePath) {
  try {
    // Fallback: try to read file from file system (may not work in Electron)
    const response = await fetch(`file://${encodeURI(filePath)}`);
    if (!response.ok) {
      throw new Error(`Failed to read file: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    
    return parseZipContent(zip);
  } catch (error) {
    console.error('Failed to parse PPTX:', error);
    return { success: false, error: error.message };
  }
}

async function parseZipContent(zip) {
  try {
    
    const slides = [];
    let slideCount = 1;
    
    // Get slide count from presentation.xml
    const presentationXml = await zip.file('ppt/presentation.xml').async('string');
    const presDoc = new DOMParser().parseFromString(presentationXml, 'text/xml');
    const slideIdList = presDoc.getElementsByTagName('p:sldIdLst')[0];
    const slideNodes = slideIdList.getElementsByTagName('p:sldId');
    slideCount = slideNodes.length;
    
    for (let i = 1; i <= slideCount; i++) {
      try {
        const slidePath = `ppt/slides/slide${i}.xml`;
        const slideXml = await zip.file(slidePath)?.async('string');
        if (!slideXml) continue;
        
        const notesPath = `ppt/notesSlides/notesSlide${i}.xml`;
        const notesXml = await zip.file(notesPath)?.async('string');
        
        const slideDoc = new DOMParser().parseFromString(slideXml, 'text/xml');
        
        // Extract text from shapes
        const textElements = slideDoc.getElementsByTagName('a:t');
        let content = '';
        for (let j = 0; j < textElements.length; j++) {
          const text = textElements[j].textContent || '';
          if (text.trim()) {
            content += text.trim() + ' ';
          }
        }
        
        // Extract title (usually first shape)
        const titleShape = slideDoc.getElementsByTagName('p:sp')[0];
        let title = '';
        if (titleShape) {
          const titleTexts = titleShape.getElementsByTagName('a:t');
          for (let j = 0; j < titleTexts.length; j++) {
            title += (titleTexts[j].textContent || '');
          }
        }
        
        // Extract notes
        let notes = '';
        if (notesXml) {
          const notesDoc = new DOMParser().parseFromString(notesXml, 'text/xml');
          const notesTexts = notesDoc.getElementsByTagName('a:t');
          for (let j = 0; j < notesTexts.length; j++) {
            notes += (notesTexts[j].textContent || '') + ' ';
          }
        }
        
        slides.push({
          slideNumber: i,
          title: title.trim() || `Slide ${i}`,
          content: content.trim(),
          notes: notes.trim()
        });
      } catch (error) {
        console.error(`Error parsing slide ${i}:`, error);
      }
    }
    
    return { success: true, slides };
  } catch (error) {
    console.error('Failed to parse zip content:', error);
    return { success: false, error: error.message };
  }
}
