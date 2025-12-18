function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    message: 'GET request received. Deployment is active and accessible.',
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const API_SECRET = 'super-secret-password-123'; 
    if (data.secret !== API_SECRET) {
       return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Unauthorized: Invalid or missing secret'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    switch (data.action) {
      case 'ping':
        return ContentService.createTextOutput(JSON.stringify({
          status: 'success',
          message: 'pong',
          timestamp: new Date().toISOString()
        })).setMimeType(ContentService.MimeType.JSON);

      case 'listDocs':
        const limit = data.limit || 10;
        const docs = listRecentDocs(limit);
        return ContentService.createTextOutput(JSON.stringify({
          status: 'success',
          documents: docs
        })).setMimeType(ContentService.MimeType.JSON);

      case 'getDocStructure':
        if (!data.docId) throw new Error("docId is required for getDocStructure");
        const structure = getDocStructure(data.docId);
        return ContentService.createTextOutput(JSON.stringify({
          status: 'success',
          structure: structure
        })).setMimeType(ContentService.MimeType.JSON);

      case 'combineDocs':
      default:
        const docIds = data.docIds;
        const title = data.title || 'Combined Document';
        if (!docIds || !Array.isArray(docIds) || docIds.length === 0) {
          throw new Error("Invalid input: 'docIds' array is required.");
        }
        const newDocUrl = combineDocsWithTabs(docIds, title);
        return ContentService.createTextOutput(JSON.stringify({
          status: 'success',
          url: newDocUrl
        })).setMimeType(ContentService.MimeType.JSON);
    }
  } catch (err) {
    console.error(err);
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString(),
      stack: err.stack
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function getDocStructure(docId) {
  const doc = DocumentApp.openById(docId);
  const result = {
    id: doc.getId(),
    title: doc.getName(),
    tabs: []
  };

  function processTabs(tabs) {
    return tabs.map(tab => {
      const tabObj = {
        title: tab.getTitle(),
        id: tab.getId(),
        type: tab.getType().toString(),
        childTabs: []
      };
      
      if (tab.getType() === DocumentApp.TabType.DOCUMENT_TAB) {
        tabObj.elements = getBodyStructure(tab.asDocumentTab().getBody());
      }
      
      const children = tab.getChildTabs();
      if (children && children.length > 0) {
        tabObj.childTabs = processTabs(children);
      }
      return tabObj;
    });
  }

  if (typeof doc.getTabs === 'function') {
    result.tabs = processTabs(doc.getTabs());
  } else {
    result.elements = getBodyStructure(doc.getBody());
  }

  return result;
}

function getBodyStructure(body) {
  const children = [];
  const numChildren = body.getNumChildren();
  for (let i = 0; i < numChildren; i++) {
    const child = body.getChild(i);
    const type = child.getType().toString();
    const item = { type: type };
    if (type === 'PARAGRAPH') {
      item.text = child.asParagraph().getText();
    } else if (type === 'TABLE') {
      item.rows = child.asTable().getNumRows();
    } else if (type === 'LIST_ITEM') {
      item.text = child.asListItem().getText();
    }
    children.push(item);
  }
  return children;
}

function listRecentDocs(limit) {
  const query = "mimeType = 'application/vnd.google-apps.document' and trashed = false";
  const files = Drive.Files.list({
    q: query,
    orderBy: 'modifiedDate desc',
    maxResults: limit,
    fields: 'items(id, title, modifiedDate, alternateLink)' 
  });
  if (!files.items) return [];
  return files.items.map(file => ({
    id: file.id,
    title: file.title,
    modifiedDate: file.modifiedDate,
    url: file.alternateLink
  }));
}

function combineDocsWithTabs(docIds, title) {
  // 1. Create the new document structure with one tab per source doc
  const tabsResource = docIds.map((id, index) => {
    let tabTitle = `Doc ${index + 1}`;
    try {
       tabTitle = DocumentApp.openById(id).getName();
    } catch (e) {}
    return { tabProperties: { title: tabTitle } };
  });

  const resource = { title: title, tabs: tabsResource };
  const newDocResource = Docs.Documents.create(resource);
  const newDocId = newDocResource.documentId;
  const newDoc = DocumentApp.openById(newDocId);
  const newDocTabs = newDoc.getTabs();

  // 2. Fill each target tab with content from source doc (including all its tabs)
  for (let i = 0; i < docIds.length; i++) {
    if (i >= newDocTabs.length) break;

    const srcDoc = DocumentApp.openById(docIds[i]);
    const targetTabBody = newDocTabs[i].asDocumentTab().getBody();

    // Helper to copy content from a body
    function copyContent(sourceBody, destinationBody) {
      const numChildren = sourceBody.getNumChildren();
      for (let j = 0; j < numChildren; j++) {
        const element = sourceBody.getChild(j).copy();
        const type = element.getType();
        try {
          if (type === DocumentApp.ElementType.PARAGRAPH) {
            destinationBody.appendParagraph(element);
          } else if (type === DocumentApp.ElementType.TABLE) {
            destinationBody.appendTable(element);
          } else if (type === DocumentApp.ElementType.LIST_ITEM) {
            destinationBody.appendListItem(element);
          } else if (type === DocumentApp.ElementType.PAGE_BREAK) {
            destinationBody.appendPageBreak(element);
          }
        } catch (e) {
          console.warn(`Skipped element type ${type}: ${e.message}`);
        }
      }
    }

    // Copy content from ALL tabs of the source document
    if (typeof srcDoc.getTabs === 'function') {
      const srcTabs = srcDoc.getTabs();
      srcTabs.forEach((tab, tIdx) => {
        if (tab.getType() === DocumentApp.TabType.DOCUMENT_TAB) {
          if (tIdx > 0) targetTabBody.appendParagraph("--- Source Tab: " + tab.getTitle() + " ---").setHeading(DocumentApp.ParagraphHeading.HEADING3);
          copyContent(tab.asDocumentTab().getBody(), targetTabBody);
        }
      });
    } else {
      copyContent(srcDoc.getBody(), targetTabBody);
    }
    
    // Remove the initial empty paragraph added by the API during creation
    if (targetTabBody.getNumChildren() > 1) {
       const firstChild = targetTabBody.getChild(0);
       if (firstChild.getType() === DocumentApp.ElementType.PARAGRAPH && firstChild.asParagraph().getText().trim() === "") {
           targetTabBody.removeChild(firstChild);
       }
    }
  }

  newDoc.saveAndClose();
  return newDoc.getUrl();
}