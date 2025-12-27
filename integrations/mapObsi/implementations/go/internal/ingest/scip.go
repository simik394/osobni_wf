package ingest

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/sourcegraph/scip/bindings/go/scip"
	"google.golang.org/protobuf/proto"

	"github.com/simik394/vault-librarian/internal/db"
)

// IngestSCIP parses a SCIP index and ingests it into FalkorDB
func IngestSCIP(ctx context.Context, indexParams string, dbClient *db.Client) error {
	// Read the SCIP index file
	indexPath := indexParams // For now assume just a path
	content, err := os.ReadFile(indexPath)
	if err != nil {
		return fmt.Errorf("failed to read index file: %w", err)
	}

	var index scip.Index
	if err := proto.Unmarshal(content, &index); err != nil {
		return fmt.Errorf("failed to unmarshal SCIP index: %w", err)
	}

	fmt.Printf("Ingesting SCIP index for metadata: %v\n", index.Metadata)

	for _, doc := range index.Documents {
		if err := ingestDocument(ctx, dbClient, doc); err != nil {
			fmt.Printf("Error ingesting doc %s: %v\n", doc.RelativePath, err)
		}
	}

	return nil
}

func ingestDocument(ctx context.Context, client *db.Client, doc *scip.Document) error {
	// Create/Match File Node
	// Note: SCIP uses relative paths. We might need a project root to map to absolute paths used by existing manual scan.
	// For now, let's treat SCIP paths as relative to project root.

	// Identify definitions
	for _, occ := range doc.Occurrences {
		if isDefinition(occ) {
			symbol := occ.Symbol
			// Parse symbol to get readable name (simple heuristic)
			name := parseSymbolName(symbol)

			// Create Node based on symbol type (Function, Class, etc is encoded in SCIP symbol strict format?)
			// SCIP symbols are: scheme manager package version descriptor
			// Descriptor can be Method, Type, Term...

			nodeType := "Symbol"
			if strings.Contains(symbol, "#") && strings.Contains(symbol, "(") {
				nodeType = "Function"
			} else if strings.Contains(symbol, "#") {
				nodeType = "Class" // Simplification
			}

			// Upsert Symbol Node
			query := fmt.Sprintf(`
				MERGE (s:%s {id: '%s'})
				SET s.name = '%s', s.path = '%s'
			`, nodeType, escapeCypher(symbol), escapeCypher(name), escapeCypher(doc.RelativePath))
			client.Query(ctx, query)

			// Link to File
			// We need to match the Code/File node. Existing nodes use absolute path.
			// This is a mapping challenge. For now, we'll create a "File" node with relative path to avoid mismatch?
			// Or we assume we run this in the root.
			fileQuery := fmt.Sprintf(`
				MERGE (c:Code {path: '%s'}) -- relative path as identity for SCIP
				MERGE (s:%s {id: '%s'})
				MERGE (c)-[:DEFINES]->(s)
			`, escapeCypher(doc.RelativePath), nodeType, escapeCypher(symbol))
			client.Query(ctx, fileQuery)
		}
	}

	// Identify References (Calls)
	for _, occ := range doc.Occurrences {
		if !isDefinition(occ) {
			// This is a reference (usage)
			// (File/Function)-[:REFERENCES]->(Symbol)
			// Finding the "source" of the reference requires knowing which function the occurrence is inside.
			// SCIP ranges would tell us. This requires an Interval Tree or simple scan.
			// Simplified: Link File -> Symbol

			refQuery := fmt.Sprintf(`
				MERGE (c:Code {path: '%s'})
				MERGE (s:Symbol {id: '%s'})
				MERGE (c)-[:REFERENCES]->(s)
			`, escapeCypher(doc.RelativePath), escapeCypher(occ.Symbol))
			client.Query(ctx, refQuery)
		}
	}

	return nil
}

func isDefinition(occ *scip.Occurrence) bool {
	return (occ.SymbolRoles & int32(scip.SymbolRole_Definition)) != 0
}

func parseSymbolName(symbol string) string {
	// format: scheme manager package version descriptor
	// e.g. scip-python python mapObsi 0.1.0 internal/db/Client#UpsertCode.
	parts := strings.Split(symbol, " ")
	if len(parts) > 0 {
		desc := parts[len(parts)-1]
		// clean up
		desc = strings.TrimSuffix(desc, ".")
		// Get last part for name
		if idx := strings.LastIndexAny(desc, "#/."); idx != -1 {
			return desc[idx+1:]
		}
		return desc
	}
	return symbol
}

func escapeCypher(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, "'", "\\'")
	s = strings.ReplaceAll(s, "\"", "\\\"")
	return s
}
