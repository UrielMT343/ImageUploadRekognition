package main

import (
	"bytes"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/aws/aws-sdk-go/service/s3"
	"github.com/aws/aws-sdk-go/service/s3/s3iface"
)

type mockS3 struct {
	s3iface.S3API
	t              *testing.T
	expectedUpload string
}

func (m *mockS3) GetObject(input *s3.GetObjectInput) (*s3.GetObjectOutput, error) {
	if *input.Key == "uploads/test-user/test.jpg" {
		return &s3.GetObjectOutput{
			Body: io.NopCloser(bytes.NewReader([]byte("mock-image-bytes"))),
		}, nil
	}
	return nil, errors.New("unexpected key")
}

func (m *mockS3) PutObject(input *s3.PutObjectInput) (*s3.PutObjectOutput, error) {
	m.expectedUpload = *input.Key
	body, _ := io.ReadAll(input.Body)
	if !bytes.Contains(body, []byte("mock-enhanced-image")) {
		m.t.Errorf("Expected enhanced image content, got: %s", body)
	}
	return &s3.PutObjectOutput{}, nil
}

func startMockESRGAN(t *testing.T) *httptest.Server {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("mock-enhanced-image"))
	})
	return httptest.NewServer(handler)
}

func TestProcessImage(t *testing.T) {
	mockServer := startMockESRGAN(t)
	defer mockServer.Close()

	forwardToESRGANFunc = func(imgData []byte, url string) (*http.Response, error) {
		req, _ := http.NewRequest("POST", mockServer.URL, bytes.NewReader(imgData))
		req.Header.Set("Content-Type", "image/jpeg")
		return http.DefaultClient.Do(req)
	}

	mock := &mockS3{t: t}

	svc = mock

	err := processImage("test-bucket", "uploads/test-user/test.jpg")
	if err != nil {
		t.Fatalf("processImage failed: %v", err)
	}

	if mock.expectedUpload != "enhanced/test-user/test.jpg" {
		t.Errorf("Unexpected upload key: %s", mock.expectedUpload)
	}
}
