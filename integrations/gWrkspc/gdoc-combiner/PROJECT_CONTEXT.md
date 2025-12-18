# Project Context: gDoc Combiner

## Overview
This project provides a Google Apps Script Web App that acts as an API for Google Docs manipulation.

## Key Information
- **Script ID**: `1Akb-32qCpeIeq0JqniXsDiOj3Vb6_J62_zTHTbX3LsLrc8qC0sKVjn7t`
- **Working Deployment ID**: `AKfycbxZ1YeLSTeqiY1wWnZX0yABCeyzMJABFlOJa_layEauX-EUS2FZdgHT8Dsp3g8FZLr8`
- **Endpoint URL**: `https://script.google.com/macros/s/AKfycbxZ1YeLSTeqiY1wWnZX0yABCeyzMJABFlOJa_layEauX-EUS2FZdgHT8Dsp3g8FZLr8/exec`
- **Security**: Requires a JSON payload with `"secret": "super-secret-password-123"`.
- **Deployment Setting**: Must be set to "Execute as: Me" and "Who has access: Anyone" in the UI.

## Supported Actions (POST)
- `ping`: Health check.
- `listDocs`: Lists recently modified Google Docs (supports `limit`).
- `getDocStructure`: Returns JSON map of a document's tabs and elements (requires `docId`).
- `createTestDoc`: Creates a doc with content for testing (supports `title`, `content`).
- `combineDocs`: Merges multiple docs into separate tabs of a new document (requires `docIds`, supports `title`).

## Implementation Notes
- Uses `Docs` and `Drive` Advanced Services.
- `combineDocs` is source-tab-aware; it will iterate through all tabs of source documents.
- Includes a 1.5s delay after doc creation to ensure `DocumentApp` can access the new file.
- `doGet` is implemented for browser-based health checks.

## Automated Testing
- Use `python3 test_gdoc_combiner.py <URL>` to verify all features.
