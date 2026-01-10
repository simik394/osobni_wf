package webhook

import (
	"bytes"
	"context"
	"jules-go/internal/db"
	"jules-go/internal/notify"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

// TestMain controls setup and teardown of tests.
func TestMain(m *testing.M) {
	// Skip tests in CI environment as they may require external services.
	if os.Getenv("CI") != "" {
		println("Skipping webhook handler tests in CI environment")
		os.Exit(0)
	}
	os.Exit(m.Run())
}

func TestHandleWebhook(t *testing.T) {
	// Setup mock ntfy server
	ntfyServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer ntfyServer.Close()

	ntfyClient := notify.NewNtfyClient(ntfyServer.URL, "test")

	// Setup FalkorDB client
	dbClient, err := db.NewClient(context.Background(), "localhost:6379")
	if err != nil {
		t.Fatalf("failed to create falkordb client for test: %v", err)
	}
	defer dbClient.Close()

	handler := handleWebhook(dbClient, ntfyClient)

	// Test case 1: Valid POST request
	t.Run("ValidPOSTRequest", func(t *testing.T) {
		validJSON := `{"event_type": "test_event", "data": {"message": "hello world"}}`
		req, err := http.NewRequest("POST", "/webhook/jules", bytes.NewBufferString(validJSON))
		if err != nil {
			t.Fatal(err)
		}

		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		if status := rr.Code; status != http.StatusOK {
			t.Errorf("handler returned wrong status code: got %v want %v",
				status, http.StatusOK)
		}

		expected := `Webhook received successfully`
		if rr.Body.String() != expected {
			t.Errorf("handler returned unexpected body: got %v want %v",
				rr.Body.String(), expected)
		}
	})

	// Test case 2: Invalid HTTP method
	t.Run("InvalidHTTPMethod", func(t *testing.T) {
		req, err := http.NewRequest("GET", "/webhook/jules", nil)
		if err != nil {
			t.Fatal(err)
		}

		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		if status := rr.Code; status != http.StatusMethodNotAllowed {
			t.Errorf("handler returned wrong status code: got %v want %v",
				status, http.StatusMethodNotAllowed)
		}
	})

	// Test case 3: Malformed JSON
	t.Run("MalformedJSON", func(t *testing.T) {
		malformedJSON := `{"event_type": "test_event", "data":`
		req, err := http.NewRequest("POST", "/webhook/jules", bytes.NewBufferString(malformedJSON))
		if err != nil {
			t.Fatal(err)
		}

		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		if status := rr.Code; status != http.StatusBadRequest {
			t.Errorf("handler returned wrong status code: got %v want %v",
				status, http.StatusBadRequest)
		}
	})
}
