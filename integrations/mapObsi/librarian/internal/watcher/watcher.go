package watcher

import (
	"context"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/simik394/vault-librarian/internal/db"
	"github.com/simik394/vault-librarian/internal/parser"
)

// Watcher watches a directory for markdown file changes
type Watcher struct {
	vaultPath  string
	debounceMs int
	db         *db.Client
	watcher    *fsnotify.Watcher

	// Debouncing
	mu       sync.Mutex
	pending  map[string]*time.Timer
	ctx      context.Context
	cancel   context.CancelFunc
}

// NewWatcher creates a new file watcher
func NewWatcher(vaultPath string, debounceMs int, dbClient *db.Client) (*Watcher, error) {
	fsWatcher, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithCancel(context.Background())

	w := &Watcher{
		vaultPath:  vaultPath,
		debounceMs: debounceMs,
		db:         dbClient,
		watcher:    fsWatcher,
		pending:    make(map[string]*time.Timer),
		ctx:        ctx,
		cancel:     cancel,
	}

	return w, nil
}

// Start begins watching the vault directory
func (w *Watcher) Start() error {
	// Add all directories recursively
	if err := w.addWatchRecursive(w.vaultPath); err != nil {
		return err
	}

	log.Printf("Watching %s for changes...", w.vaultPath)

	go w.eventLoop()
	return nil
}

// Stop stops the watcher
func (w *Watcher) Stop() {
	w.cancel()
	w.watcher.Close()
}

// addWatchRecursive adds a directory and all subdirectories to the watcher
func (w *Watcher) addWatchRecursive(root string) error {
	return filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		// Skip hidden directories
		if info.IsDir() && strings.HasPrefix(info.Name(), ".") {
			return filepath.SkipDir
		}

		if info.IsDir() {
			if err := w.watcher.Add(path); err != nil {
				log.Printf("Warning: could not watch %s: %v", path, err)
			}
		}

		return nil
	})
}

// eventLoop processes file system events
func (w *Watcher) eventLoop() {
	for {
		select {
		case <-w.ctx.Done():
			return

		case event, ok := <-w.watcher.Events:
			if !ok {
				return
			}
			w.handleEvent(event)

		case err, ok := <-w.watcher.Errors:
			if !ok {
				return
			}
			log.Printf("Watcher error: %v", err)
		}
	}
}

// handleEvent processes a single file system event
func (w *Watcher) handleEvent(event fsnotify.Event) {
	path := event.Name

	// Only process markdown files
	if !strings.HasSuffix(path, ".md") {
		// But watch new directories
		if event.Op&fsnotify.Create != 0 {
			if info, err := os.Stat(path); err == nil && info.IsDir() {
				w.addWatchRecursive(path)
			}
		}
		return
	}

	// Skip hidden files
	if strings.Contains(path, "/.") {
		return
	}

	// Debounce the event
	w.debounce(path, func() {
		w.processFile(path, event.Op)
	})
}

// debounce delays processing until events settle
func (w *Watcher) debounce(path string, fn func()) {
	w.mu.Lock()
	defer w.mu.Unlock()

	// Cancel existing timer
	if timer, exists := w.pending[path]; exists {
		timer.Stop()
	}

	// Set new timer
	w.pending[path] = time.AfterFunc(time.Duration(w.debounceMs)*time.Millisecond, func() {
		w.mu.Lock()
		delete(w.pending, path)
		w.mu.Unlock()
		fn()
	})
}

// processFile handles a file change
func (w *Watcher) processFile(path string, op fsnotify.Op) {
	ctx := context.Background()

	if op&fsnotify.Remove != 0 || op&fsnotify.Rename != 0 {
		// File was deleted or renamed
		log.Printf("Deleted: %s", path)
		if err := w.db.DeleteNote(ctx, path); err != nil {
			log.Printf("Error deleting note: %v", err)
		}
		return
	}

	// File was created or modified
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return // File doesn't exist anymore
	}

	meta, err := parser.ParseFile(path)
	if err != nil {
		log.Printf("Error parsing %s: %v", path, err)
		return
	}

	log.Printf("Updated: %s (tags=%d, links=%d)", path, len(meta.Tags), len(meta.Wikilinks))

	if err := w.db.UpsertNote(ctx, meta); err != nil {
		log.Printf("Error syncing %s: %v", path, err)
	}
}

// FullScan performs an initial full scan of the vault
func (w *Watcher) FullScan() (int, error) {
	count := 0
	ctx := context.Background()

	err := filepath.Walk(w.vaultPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		// Skip hidden directories
		if info.IsDir() && strings.HasPrefix(info.Name(), ".") {
			return filepath.SkipDir
		}

		// Only process markdown files
		if !info.IsDir() && strings.HasSuffix(path, ".md") {
			meta, err := parser.ParseFile(path)
			if err != nil {
				log.Printf("Warning: could not parse %s: %v", path, err)
				return nil
			}

			if err := w.db.UpsertNote(ctx, meta); err != nil {
				log.Printf("Warning: could not sync %s: %v", path, err)
				return nil
			}

			count++
			if count%100 == 0 {
				log.Printf("Scanned %d files...", count)
			}
		}

		return nil
	})

	return count, err
}
