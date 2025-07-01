package main

// curl.exe -X POST -F image=@calabazito.jpg http://localhost:8080/enhance --output enhanced.jpg

import (
	"bytes"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
)

func main() {
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	http.HandleFunc("/enhance", enhanceHandler)

	fmt.Println("Go Backend running on :8080")
	err := http.ListenAndServe(":8080", nil)
	if err != nil {
		log.Fatal(err)
	}
}

func enhanceHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse incoming multipart form
	err := r.ParseMultipartForm(10 << 20) // 10MB max memory
	if err != nil {
		http.Error(w, "Error parsing form", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("image")
	if err != nil {
		http.Error(w, "Missing or invalid image", http.StatusBadRequest)
		return
	}
	defer file.Close()

	fmt.Printf("Received image: %s (%d bytes)\n", header.Filename, header.Size)

	imgBytes, err := io.ReadAll(file)
	if err != nil {
		http.Error(w, "Failed to read image", http.StatusInternalServerError)
		return
	}

	// Forward to ESRGAN service inside Docker network
	fmt.Println("Forwarding image to ESRGAN")
	resp, err := forwardToESRGAN(imgBytes, "http://esrgan-service:5000/enhance/")
	fmt.Println("Received response from ESRGAN:", resp.Status)
	if err != nil {
		http.Error(w, "Enhancement failed", http.StatusInternalServerError)
		log.Println("Error forwarding to ESRGAN:", err)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "image/jpeg")
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

func forwardToESRGAN(imgData []byte, url string) (*http.Response, error) {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)

	part, err := mw.CreateFormFile("file", "image.jpg")
	if err != nil {
		return nil, err
	}

	_, err = io.Copy(part, bytes.NewReader(imgData))
	if err != nil {
		return nil, err
	}

	mw.Close()

	req, err := http.NewRequest("POST", url, &buf)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())

	client := &http.Client{}
	return client.Do(req)
}
