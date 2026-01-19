// PPTX Parser for Main Process (runs in Node.js, not renderer)
const JSZip = require('jszip');
const fs = require('fs');
const { DOMParser } = require('@xmldom/xmldom');

async function parsePPTXFromPath(filePath) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(fileBuffer);
    
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
    const presentationXml = await zip.file('ppt/presentation.xml')?.async('string');
    if (!presentationXml) {
      return { success: false, error: 'Invalid PPTX file: presentation.xml not found' };
    }
    
    const presDoc = new DOMParser().parseFromString(presentationXml, 'text/xml');
    const slideIdList = presDoc.getElementsByTagName('p:sldIdLst')[0];
    if (!slideIdList) {
      // Fallback: try to find slides by counting slide files
      const slideFiles = Object.keys(zip.files).filter(f => f.match(/ppt\/slides\/slide\d+\.xml/));
      slideCount = slideFiles.length;
    } else {
      const slideNodes = slideIdList.getElementsByTagName('p:sldId');
      slideCount = slideNodes.length;
    }
    
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

module.exports = { parsePPTXFromPath };
