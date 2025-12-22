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

// Start begins watching the configured sources
func (w *Watcher) Start() error {
	for _, src := range w.cfg.Sources {
		if src.Enabled {
			path := src.Path
			// Expand home dir if needed (handled in config loader, but double check)
			if strings.HasPrefix(path, "~") {
				home, _ := os.UserHomeDir()
				path = filepath.Join(home, path[1:])
			}
			
			if err := w.addWatchRecursive(path); err != nil {
				// Don't fail completely if one source is missing?
				log.Printf("Warning: failed to watch source %s: %v", path, err)
				continue
			}
			log.Printf("Watching %s for changes...", path)
		}
	}

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
			for _, pattern := range w.cfg.GlobalIgnore.Patterns {
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

	w.pending[path] = time.AfterFunc(time.Duration(w.cfg.Watcher.DebounceMs)*time.Millisecond, func() {
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

	projectName := w.getProjectName(path)

	switch fileType {
	case "markdown":
		meta, err := parser.ParseMarkdown(path)
		if err != nil {
			log.Printf("Error parsing markdown %s: %v", path, err)
			return
		}
		log.Printf("Updated: %s [Project: %s] (tags=%d, links=%d)", path, projectName, len(meta.Tags), len(meta.Wikilinks))
		if err := w.db.UpsertNote(ctx, meta, projectName); err != nil {
			log.Printf("Error syncing note %s: %v", path, err)
		}

	case "code":
		meta, err := parser.ParseCode(path)
		if err != nil {
			log.Printf("Error parsing code %s: %v", path, err)
			return
		}
		log.Printf("Updated: %s [Project: %s] [%s]", path, projectName, meta.Language)
		if err := w.db.UpsertCode(ctx, meta, projectName); err != nil {
			log.Printf("Error syncing code %s: %v", path, err)
		}

	case "asset":
		log.Printf("Asset: %s", path)
	}
}

// getProjectName determines the project name from the file path
func (w *Watcher) getProjectName(path string) string {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return ""
	}

	for _, src := range w.cfg.Sources {
		if !src.Enabled {
			continue
		}
		
		// Check if file is in this source
		srcPath := src.Path
		if strings.HasPrefix(srcPath, "~") {
			home, _ := os.UserHomeDir()
			srcPath = filepath.Join(home, srcPath[1:])
		}
		srcPath, _ = filepath.Abs(srcPath)

		if strings.HasPrefix(absPath, srcPath) {
			// Calculate relative path
			rel, err := filepath.Rel(srcPath, absPath)
			if err != nil {
				continue
			}
			
			// Detect project based on roots
			// Loop config ProjectRoots (e.g. "Prods")
			// If rel starts with "Prods/ProjectName/...", extract ProjectName
			parts := strings.Split(rel, string(os.PathSeparator))
			
			for _, root := range w.cfg.ProjectRoots {
				if len(parts) >= 2 && parts[0] == root {
					// parts[1] is the project name
					return parts[1]
				}
			}
		}
	}
	return ""
}

// FullScan performs scan of all sources or a specific path override
func (w *Watcher) FullScan(overridePath string) (notes, code, assets int, err error) {
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
				projectName := w.getProjectName(j.path)

				switch j.fileType {
				case "markdown":
					meta, parseErr := parser.ParseMarkdown(j.path)
					if parseErr != nil {
						log.Printf("Warning: could not parse %s: %v", j.path, parseErr)
						continue
					}
					if syncErr := w.db.UpsertNote(ctx, meta, projectName); syncErr != nil {
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
					if syncErr := w.db.UpsertCode(ctx, meta, projectName); syncErr != nil {
						log.Printf("Warning: could not sync %s: %v", j.path, syncErr)
						continue
					}
					localCode++

				case "asset":
					localAssets++
				}
			}
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
		}
		done <- true
	}()

	// Job Generators
	walkFn := func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if info.IsDir() {
			if strings.HasPrefix(info.Name(), ".") {
				return filepath.SkipDir
			}
			for _, pattern := range w.cfg.GlobalIgnore.Patterns {
				if config.MatchGlob(pattern, path) {
					return filepath.SkipDir
				}
			}
			return nil
		}
		fileType, should := w.cfg.ShouldProcess(path)
		if should {
			jobs <- job{path: path, fileType: fileType}
		}
		return nil
	}

	if overridePath != "" {
		err = filepath.Walk(overridePath, walkFn)
	} else {
		for _, src := range w.cfg.Sources {
			if src.Enabled {
				path := src.Path
				if strings.HasPrefix(path, "~") {
					home, _ := os.UserHomeDir()
					path = filepath.Join(home, path[1:])
				}
				if walkErr := filepath.Walk(path, walkFn); walkErr != nil {
					log.Printf("Error walking source %s: %v", path, walkErr)
					// Don't fail entire scan for one source?
					// err = walkErr 
				}
			}
		}
	}

	close(jobs)
	wg.Wait()
	close(results)
	<-done

	return notes, code, assets, err
}
