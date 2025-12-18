# Google Doc Combiner & Utility API

This Google Apps Script project provides a Web App endpoint that functions as a multi-purpose API for Google Docs automation. It can combine documents into Tabs and list recently modified documents.

## Features

- **Combine Docs**: Combines multiple source Google Docs into a single new document using the "Tabs" feature.
- **List Recent Docs**: Returns a list of the most recently modified Google Docs in your Drive.
- **Inspect Doc Structure**: Returns the JSON structure of a document (tabs, paragraphs, tables) for debugging.
- **Create Test Doc**: Creates a simple document with text content for testing purposes.
- **Secure Access**: Protected by a shared secret token.

## Setup & Deployment

1.  **Push Code**:
    ```bash
    clasp push
    ```

2.  **Deploy**:
    Use `clasp open` to create a new "Web App" deployment.
    *   **Execute as**: Me
    *   **Who has access**: Anyone

    *Note: You MUST authorize the script in the Editor at least once by running the `doPost` or `listRecentDocs` function manually to grant permissions (Drive/Docs).*

## Usage

### Endpoint
Use your Web App URL ending in `/exec`.

### Authentication
All `POST` requests must include the secret token:
`"secret": "super-secret-password-123"`

### Actions

#### 1. Combine Documents (Default)
Combines multiple documents into one, with each source doc as a separate Tab.

**Payload:**
```json
{
  "action": "combineDocs",
  "secret": "super-secret-password-123",
  "docIds": ["SOURCE_DOC_ID_1", "SOURCE_DOC_ID_2"],
  "title": "Combined Report Name"
}
```

**Response:**
```json
{
  "status": "success",
  "url": "https://docs.google.com/document/d/NEW_DOC_ID/edit"
}
```

#### 2. List Recent Documents
Lists the most recently modified Google Docs (useful for finding IDs).

**Payload:**
```json
{
  "action": "listDocs",
  "secret": "super-secret-password-123",
  "limit": 5
}
```

#### 3. Get Document Structure
Returns the internal structure (tabs, children) of a document.

**Payload:**
```json
{
  "action": "getDocStructure",
  "secret": "super-secret-password-123",
  "docId": "YOUR_DOC_ID"
}
```

#### 4. Create Test Document
Creates a document with specified content.

**Payload:**
```json
{
  "action": "createTestDoc",
  "secret": "super-secret-password-123",
  "title": "My Test Doc",
  "content": "Hello World"
}
```

#### 5. Ping (Health Check)
Verifies the endpoint is active.

**Payload:**
```json
{
  "action": "ping",
  "secret": "super-secret-password-123"
}
```

## Implementation Details

- **Language**: Google Apps Script
- **Services**: `DocumentApp`, `Docs` (Advanced), `Drive` (Advanced).
- **Architecture**: Single `doPost` entry point routing to functions based on `action` parameter.