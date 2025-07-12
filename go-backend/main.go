package main

import (
	"bytes"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"strings"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3"
	"github.com/aws/aws-sdk-go/service/s3/s3iface"
)

var forwardToESRGANFunc = forwardToESRGAN
var svc s3iface.S3API

func main() {
	fmt.Println("Go container started for ESRGAN enhancement")

	sess := session.Must(session.NewSession())
	svc = s3.New(sess)

	bucket := os.Getenv("BUCKET")
	inputKey := os.Getenv("INPUT_KEY")

	if bucket == "" || inputKey == "" {
		log.Fatal("Missing BUCKET or INPUT_KEY environment variables")
	}

	err := processImage(bucket, inputKey)
	if err != nil {
		log.Fatalf("Failed to enhance image: %v", err)
	}

	fmt.Println("Enhancement complete. Container exiting.")
}

func processImage(bucket, key string) error {
	fmt.Printf("Downloading image from s3://%s/%s\n", bucket, key)

	out, err := svc.GetObject(&s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return fmt.Errorf("failed to get object: %w", err)
	}
	defer out.Body.Close()

	imgBytes, err := io.ReadAll(out.Body)
	if err != nil {
		return fmt.Errorf("failed to read image body: %w", err)
	}

	fmt.Println("Forwarding image to ESRGAN container")
	resp, err := forwardToESRGANFunc(imgBytes, "http://localhost:5000/enhance/")
	if err != nil {
		return fmt.Errorf("ESRGAN call failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("ESRGAN returned bad status: %s", resp.Status)
	}

	enhancedImg, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read enhanced image: %w", err)
	}

	outputKey := strings.Replace(key, "uploads/", "enhanced/", 1)
	fmt.Printf("Uploading enhanced image to s3://%s/%s\n", bucket, outputKey)

	_, err = svc.PutObject(&s3.PutObjectInput{
		Bucket:      aws.String(bucket),
		Key:         aws.String(outputKey),
		Body:        bytes.NewReader(enhancedImg),
		ContentType: aws.String("image/jpeg"),
	})
	if err != nil {
		return fmt.Errorf("failed to upload enhanced image: %w", err)
	}

	return nil
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
