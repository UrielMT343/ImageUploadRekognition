package main

import (
	"bytes"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Mock ESRGAN service for tests
func startMockESRGAN() *httptest.Server {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("mock-enhanced-image-data"))
	})
	return httptest.NewServer(handler)
}

func TestEnhanceEndpoint(t *testing.T) {
	// Start mock ESRGAN server
	mockServer := startMockESRGAN()
	defer mockServer.Close()

	// Override the forwarding function to hit the mock server
	originalForward := forwardToESRGANFunc
	forwardToESRGANFunc = func(imgData []byte, url string) (*http.Response, error) {
		var buf bytes.Buffer
		mw := multipart.NewWriter(&buf)

		part, _ := mw.CreateFormFile("file", "image.jpg")
		part.Write(imgData)
		mw.Close()

		req, _ := http.NewRequest("POST", mockServer.URL, &buf)
		req.Header.Set("Content-Type", mw.FormDataContentType())
		client := &http.Client{}
		return client.Do(req)
	}
	defer func() { forwardToESRGANFunc = originalForward }()

	// Setup server with the enhance handler
	mux := http.NewServeMux()
	mux.HandleFunc("/enhance", enhanceHandler)
	ts := httptest.NewServer(mux)
	defer ts.Close()

	// Prepare fake image data for testing
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, _ := writer.CreateFormFile("image", "test.jpg")
	part.Write([]byte("fake-image-data"))
	writer.Close()

	// Send request to the /enhance endpoint
	req, _ := http.NewRequest("POST", ts.URL+"/enhance", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("Request failed: %v", err)
	}
	defer resp.Body.Close()

	// Validate response status code
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d", resp.StatusCode)
	}

	// Validate response body
	respData, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(respData), "mock-enhanced-image-data") {
		t.Errorf("Unexpected response body: %s", respData)
	}
}
