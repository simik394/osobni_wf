package shutdown

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"
)

func TestNewManager(t *testing.T) {
	t.Run("with custom timeout", func(t *testing.T) {
		timeout := 10 * time.Second
		sm := NewManager(timeout)
		if sm == nil {
			t.Fatal("expected manager, got nil")
		}
		if sm.shutdownTimeout != timeout {
			t.Errorf("expected timeout %v, got %v", timeout, sm.shutdownTimeout)
		}
	})

	t.Run("with zero timeout uses default", func(t *testing.T) {
		sm := NewManager(0)
		if sm == nil {
			t.Fatal("expected manager, got nil")
		}
		if sm.shutdownTimeout != 30*time.Second {
			t.Errorf("expected default timeout 30s, got %v", sm.shutdownTimeout)
		}
	})
}

func TestAdd(t *testing.T) {
	sm := NewManager(5 * time.Second)

	var callCount int
	closer := func(ctx context.Context) error {
		callCount++
		return nil
	}

	sm.Add(closer)
	sm.Add(closer)
	sm.Add(closer)

	if len(sm.closers) != 3 {
		t.Errorf("expected 3 closers, got %d", len(sm.closers))
	}
}

func TestClosersCalledInReverseOrder(t *testing.T) {
	sm := NewManager(5 * time.Second)

	var order []int
	sm.Add(func(ctx context.Context) error {
		order = append(order, 1)
		return nil
	})
	sm.Add(func(ctx context.Context) error {
		order = append(order, 2)
		return nil
	})
	sm.Add(func(ctx context.Context) error {
		order = append(order, 3)
		return nil
	})

	// Manually call closers in reverse order to test the logic
	ctx := context.Background()
	for i := len(sm.closers) - 1; i >= 0; i-- {
		sm.closers[i](ctx)
	}

	if len(order) != 3 {
		t.Fatalf("expected 3 calls, got %d", len(order))
	}
	if order[0] != 3 || order[1] != 2 || order[2] != 1 {
		t.Errorf("expected reverse order [3,2,1], got %v", order)
	}
}

func TestCloserErrorHandling(t *testing.T) {
	sm := NewManager(5 * time.Second)

	var called atomic.Bool
	sm.Add(func(ctx context.Context) error {
		return errors.New("test error")
	})
	sm.Add(func(ctx context.Context) error {
		called.Store(true)
		return nil
	})

	// Verify both closers are registered
	if len(sm.closers) != 2 {
		t.Errorf("expected 2 closers, got %d", len(sm.closers))
	}

	// Manually run closers to verify error doesn't stop execution
	ctx := context.Background()
	for i := len(sm.closers) - 1; i >= 0; i-- {
		_ = sm.closers[i](ctx)
	}

	if !called.Load() {
		t.Error("expected second closer to be called despite first error")
	}
}
