package watcher

import (
	"context"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/simik394/vault-librarian/internal/config"
	"github.com/simik394/vault-librarian/internal/db"
	"github.com/simik394/vault-librarian/internal/parser"
)

// Watcher watches a directory for file changes
type Watcher struct {
	cfg       *config.Config
	db        *db.Client
	watcher   *fsnotify.Watcher

	// Debouncing
	mu       sync.Mutex
	pending  map[string]*time.Timer
	ctx      context.Context
	cancel   context.CancelFunc
}

// NewWatcher creates a new file watcher
func NewWatcher(cfg *config.Config, dbClient *db.Client) (*Watcher, error) {
	fsWatcher, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithCancel(context.Background())

	w := &Watcher{
		cfg:     cfg,
		db:      dbClient,
		watcher: fsWatcher,
		pending: make(map[string]*time.Timer),
		ctx:     ctx,
		cancel:  cancel,
	}

	return w, nil
}

// Start begins watching the vault directory
func (w *Watcher) Start() error {
	if err := w.addWatchRecursive(w.cfg.VaultPath); err != nil {
		return err
	}

	log.Printf("Watching %s for changes...", w.cfg.VaultPath)

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

		// Skip hidden directories and global excludes
		if info.IsDir() {
			if strings.HasPrefix(info.Name(), ".") {
				return filepath.SkipDir
			}
			// Check global excludes
			for _, pattern := range w.cfg.GlobalExclude {
				if config.MatchGlob(pattern, path) {
					return filepath.SkipDir
				}
			}
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

	// Check if new directory
	if event.Op&fsnotify.Create != 0 {
		if info, err := os.Stat(path); err == nil && info.IsDir() {
			w.addWatchRecursive(path)
		}
	}

	// Check if file should be processed
	fileType, should := w.cfg.ShouldProcess(path)
	if !should {
		return
	}

	// Debounce the event
	w.debounce(path, func() {
		w.processFile(path, fileType, event.Op)
	})
}

// debounce delays processing until events settle
func (w *Watcher) debounce(path string, fn func()) {
	w.mu.Lock()
	defer w.mu.Unlock()

	if timer, exists := w.pending[path]; exists {
		timer.Stop()
	}

	w.pending[path] = time.AfterFunc(time.Duration(w.cfg.DebounceMs)*time.Millisecond, func() {
		w.mu.Lock()
		delete(w.pending, path)
		w.mu.Unlock()
		fn()
	})
}

// processFile handles a file change
func (w *Watcher) processFile(path string, fileType string, op fsnotify.Op) {
	ctx := context.Background()

	if op&fsnotify.Remove != 0 || op&fsnotify.Rename != 0 {
		log.Printf("Deleted: %s", path)
		switch fileType {
		case "markdown":
			w.db.DeleteNote(ctx, path)
		case "code":
			w.db.DeleteCode(ctx, path)
		}
		return
	}

	if _, err := os.Stat(path); os.IsNotExist(err) {
		return
	}

	switch fileType {
	case "markdown":
		meta, err := parser.ParseMarkdown(path)
		if err != nil {
			log.Printf("Error parsing markdown %s: %v", path, err)
			return
		}
		log.Printf("Updated: %s (tags=%d, links=%d)", path, len(meta.Tags), len(meta.Wikilinks))
		if err := w.db.UpsertNote(ctx, meta); err != nil {
			log.Printf("Error syncing note %s: %v", path, err)
		}

	case "code":
		meta, err := parser.ParseCode(path)
		if err != nil {
			log.Printf("Error parsing code %s: %v", path, err)
			return
		}
		log.Printf("Updated: %s [%s] (funcs=%d, classes=%d)", path, meta.Language, len(meta.Functions), len(meta.Classes))
		if err := w.db.UpsertCode(ctx, meta); err != nil {
			log.Printf("Error syncing code %s: %v", path, err)
		}

	case "asset":
		// Just track existence for now
		log.Printf("Asset: %s", path)
	}
}

// FullScan performs an initial full scan of the vault parallely
func (w *Watcher) FullScan() (notes, code, assets int, err error) {
	// Worker pool setup
	numWorkers := runtime.NumCPU()
	type job struct {
		path     string
		fileType string
	}
	jobs := make(chan job, 1000)
	
	type result struct {
		notes, code, assets int
		err                 error
	}
	results := make(chan result, 1000)
	var wg sync.WaitGroup

	// Start workers
	for i := 0; i < numWorkers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			ctx := context.Background()
			
			localNotes, localCode, localAssets := 0, 0, 0

			for j := range jobs {
				switch j.fileType {
				case "markdown":
					meta, parseErr := parser.ParseMarkdown(j.path)
					if parseErr != nil {
						log.Printf("Warning: could not parse %s: %v", j.path, parseErr)
						continue
					}
					if syncErr := w.db.UpsertNote(ctx, meta); syncErr != nil {
						log.Printf("Warning: could not sync %s: %v", j.path, syncErr)
						continue
					}
					localNotes++

				case "code":
					meta, parseErr := parser.ParseCode(j.path)
					if parseErr != nil {
						log.Printf("Warning: could not parse %s: %v", j.path, parseErr)
						continue
					}
					if syncErr := w.db.UpsertCode(ctx, meta); syncErr != nil {
						log.Printf("Warning: could not sync %s: %v", j.path, syncErr)
						continue
					}
					localCode++

				case "asset":
					localAssets++
				}
			}
			
			// Send aggregated results
			results <- result{notes: localNotes, code: localCode, assets: localAssets}
		}()
	}

	// Results collector
	done := make(chan bool)
	go func() {
		for res := range results {
			notes += res.notes
			code += res.code
			assets += res.assets
			// Ignoring individual errors for now in aggregation
		}
		done <- true
	}()

	// Walk and push jobs
	err = filepath.Walk(w.cfg.VaultPath, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}

		// Skip hidden directories
		if info.IsDir() {
			if strings.HasPrefix(info.Name(), ".") {
				return filepath.SkipDir
			}
			// Check global excludes
			for _, pattern := range w.cfg.GlobalExclude {
				if config.MatchGlob(pattern, path) {
					return filepath.SkipDir
				}
			}
			return nil
		}

		// Check if file should be processed
		fileType, should := w.cfg.ShouldProcess(path)
		if !should {
			return nil
		}

		jobs <- job{path: path, fileType: fileType}
		return nil
	})

	close(jobs)
	wg.Wait()
	close(results)
	<-done

	return notes, code, assets, err
}
