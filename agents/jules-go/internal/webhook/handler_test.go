package webhook

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandleWebhook(t *testing.T) {
	// Test case 1: Valid POST request
	t.Run("ValidPOSTRequest", func(t *testing.T) {
		validJson := `{"event_type": "test_event", "data": {"message": "hello world"}}`
		req, err := http.NewRequest("POST", "/webhook/jules", bytes.NewBufferString(validJson))
		if err != nil {
			t.Fatal(err)
		}

		rr := httptest.NewRecorder()
		handler := http.HandlerFunc(handleWebhook)

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
		handler := http.HandlerFunc(handleWebhook)

		handler.ServeHTTP(rr, req)

		if status := rr.Code; status != http.StatusMethodNotAllowed {
			t.Errorf("handler returned wrong status code: got %v want %v",
				status, http.StatusMethodNotAllowed)
		}
	})

	// Test case 3: Malformed JSON
	t.Run("MalformedJSON", func(t *testing.T) {
		malformedJson := `{"event_type": "test_event", "data":`
		req, err := http.NewRequest("POST", "/webhook/jules", bytes.NewBufferString(malformedJson))
		if err != nil {
			t.Fatal(err)
		}

		rr := httptest.NewRecorder()
		handler := http.HandlerFunc(handleWebhook)

		handler.ServeHTTP(rr, req)

		if status := rr.Code; status != http.StatusBadRequest {
			t.Errorf("handler returned wrong status code: got %v want %v",
				status, http.StatusBadRequest)
		}
	})
}
