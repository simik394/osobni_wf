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
          message: 'pong v100', 
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

      case 'checkTabsSupport':
        if (!data.docId) throw new Error("docId is required for checkTabsSupport");
        const supportInfo = checkTabsSupport(data.docId);
        return ContentService.createTextOutput(JSON.stringify({
          status: 'success',
          info: supportInfo
        })).setMimeType(ContentService.MimeType.JSON);

      case 'createTestDoc':
        const testTitle = data.title || 'Auto-Generated Test Doc';
        const content = data.content || 'This is some test content.';
        const newTestDocUrl = createTestDoc(testTitle, content);
        return ContentService.createTextOutput(JSON.stringify({
          status: 'success',
          url: newTestDocUrl
        })).setMimeType(ContentService.MimeType.JSON);

      case 'combineDocs':
      default:
        const docIds = data.docIds;
        const title = data.title || 'Combined Document';
        if (!docIds || !Array.isArray(docIds) || docIds.length === 0) {
          throw new Error("Invalid input: 'docIds' array is required.");
        }
        const result = combineDocsWithTabs(docIds, title);
        return ContentService.createTextOutput(JSON.stringify({
          status: 'success',
          url: result.url,
          debug: result.debug
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

/**
 * Checks if the Docs API v1 actually sees the 'tabs' property for a document.
 */
function checkTabsSupport(docId) {
  const result = {
    method: "Docs.Documents.get(docId)",
    hasTabsProperty: false,
    tabsCount: 0,
    message: ""
  };
  try {
    const doc = Docs.Documents.get(docId);
    if (doc.tabs) {
      result.hasTabsProperty = true;
      result.tabsCount = doc.tabs.length;
      result.message = "API v1 sees 'tabs' property.";
    } else {
      result.message = "API v1 does NOT see 'tabs' property. This doc is in legacy single-body mode.";
    }
  } catch (e) {
    result.error = e.message;
  }
  return result;
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

function getDocStructure(docId) {
  const doc = DocumentApp.openById(docId);
  const result = { id: doc.getId(), title: doc.getName(), tabs: [] };
  function processTabs(tabs) {
    return tabs.map(tab => {
      const tabObj = { title: tab.getTitle(), id: tab.getId(), type: tab.getType().toString() };
      if (tab.getType() === DocumentApp.TabType.DOCUMENT_TAB) {
        tabObj.elementsCount = tab.asDocumentTab().getBody().getNumChildren();
      }
      const children = tab.getChildTabs();
      if (children && children.length > 0) tabObj.childTabs = processTabs(children);
      return tabObj;
    });
  }
  if (typeof doc.getTabs === 'function') {
    result.tabs = processTabs(doc.getTabs());
  } else {
    result.elementsCount = doc.getBody().getNumChildren();
  }
  return result;
}

function createTestDoc(title, content) {
  const doc = DocumentApp.create(title);
  doc.getBody().appendParagraph(content);
  doc.saveAndClose();
  return doc.getUrl();
}

function combineDocsWithTabs(docIds, title) {
  // Create doc with initial tabs using Docs API schema
  const tabsConfig = docIds.map((id, index) => {
    let tTitle = "Tab " + (index + 1);
    try { tTitle = DocumentApp.openById(id).getName(); } catch (e) {}
    return {
      tabProperties: { title: tTitle },
      documentTab: {
        body: { content: [{ paragraph: { elements: [{ textRun: { content: "\n" } }] } }] }
      }
    };
  });

  const createdDoc = Docs.Documents.create({ title: title, tabs: tabsConfig });
  const newDocId = createdDoc.documentId;
  
  Utilities.sleep(3000); 

  const newDoc = DocumentApp.openById(newDocId);
  const appTabs = newDoc.getTabs();

  for (let i = 0; i < docIds.length; i++) {
    let targetBody;
    if (i < appTabs.length) {
      targetBody = appTabs[i].asDocumentTab().getBody();
    } else {
      targetBody = appTabs[0].asDocumentTab().getBody();
      targetBody.appendParagraph("--- " + DocumentApp.openById(docIds[i]).getName() + " ---").setHeading(DocumentApp.ParagraphHeading.HEADING2);
    }

    try {
      const srcDoc = DocumentApp.openById(docIds[i]);
      copyContent(srcDoc.getBody(), targetBody);
      if (targetBody.getNumChildren() > 1) {
         const first = targetBody.getChild(0);
         if (first.getType() === DocumentApp.ElementType.PARAGRAPH && first.asParagraph().getText().trim() === "") {
             targetBody.removeChild(first);
         }
      }
    } catch (e) {}
  }

  newDoc.saveAndClose();
  return {
    url: newDoc.getUrl(),
    debug: {
      action: "Docs.create full-tabs-v100",
      totalTabs: appTabs.length,
      requestedTabs: docIds.length
    }
  };
}

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
    } catch (e) {}
  }
}
