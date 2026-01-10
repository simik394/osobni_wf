package queue

import (
	"context"
	"log/slog"
	"sync"
	"time"
)

// Processor defines the interface for processing a task.
type Processor interface {
	Process(task *Task) error
}

// Worker is a single worker that processes tasks from the queue.
type Worker struct {
	id        int
	queue     *TaskQueue
	processor Processor
	quit      chan struct{}
	wg        *sync.WaitGroup
}

func NewWorker(id int, queue *TaskQueue, processor Processor, wg *sync.WaitGroup) *Worker {
	return &Worker{
		id:        id,
		queue:     queue,
		processor: processor,
		quit:      make(chan struct{}),
		wg:        wg,
	}
}

func (w *Worker) Start(ctx context.Context) {
	defer w.wg.Done()
	slog.Info("worker started", "worker_id", w.id)

	for {
		select {
		case <-w.quit:
			slog.Info("worker stopped", "worker_id", w.id)
			return
		default:
			task, err := w.queue.Dequeue(ctx)
			if err != nil {
				slog.Error("failed to dequeue task", "worker_id", w.id, "error", err)
				time.Sleep(5 * time.Second) // Wait before retrying
				continue
			}

			if task == nil {
				// No task available, wait a bit
				time.Sleep(2 * time.Second)
				continue
			}

			slog.Info("worker processing task", "worker_id", w.id, "task_id", task.ID)
			err = w.processor.Process(task)
			if err != nil {
				slog.Error("failed to process task, moving to dead-letter", "worker_id", w.id, "task_id", task.ID, "error", err)
				if failErr := w.queue.FailTask(ctx, task.ID); failErr != nil {
					slog.Error("failed to move task to dead-letter queue", "worker_id", w.id, "task_id", task.ID, "error", failErr)
				}
			} else {
				slog.Info("task processed successfully", "worker_id", w.id, "task_id", task.ID)
				if completeErr := w.queue.CompleteTask(ctx, task.ID); completeErr != nil {
					slog.Error("failed to complete task", "worker_id", w.id, "task_id", task.ID, "error", completeErr)
				}
			}
		}
	}
}

func (w *Worker) Stop() {
	close(w.quit)
}

// WorkerPool manages a pool of workers.
type WorkerPool struct {
	workerCount int
	queue       *TaskQueue
	processor   Processor
	workers     []*Worker
	wg          *sync.WaitGroup
}

// NewWorkerPool creates a new WorkerPool.
func NewWorkerPool(workerCount int, queue *TaskQueue, processor Processor) *WorkerPool {
	if workerCount <= 0 {
		workerCount = 5 // Default worker count
	}
	return &WorkerPool{
		workerCount: workerCount,
		queue:       queue,
		processor:   processor,
		workers:     make([]*Worker, workerCount),
		wg:          new(sync.WaitGroup),
	}
}

// Start starts all workers in the pool.
func (p *WorkerPool) Start(ctx context.Context) {
	slog.Info("starting worker pool", "worker_count", p.workerCount)
	for i := 0; i < p.workerCount; i++ {
		worker := NewWorker(i+1, p.queue, p.processor, p.wg)
		p.workers[i] = worker
		p.wg.Add(1)
		go worker.Start(ctx)
	}
}

// Stop stops all workers in the pool and waits for them to finish.
func (p *WorkerPool) Stop() {
	slog.Info("stopping worker pool")
	for _, worker := range p.workers {
		worker.Stop()
	}
	p.wg.Wait()
	slog.Info("worker pool stopped")
}
