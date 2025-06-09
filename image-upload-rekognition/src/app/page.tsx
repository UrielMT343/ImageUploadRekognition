// src/app/page.tsx
"use client";

import { useState, ChangeEvent, FormEvent, useRef, useEffect } from 'react';
import styles from './page.module.css';

// Define types for our data
type BoundingBox = { Width: number; Height: number; Left: number; Top: number; };
type DetectedObject = { Label: string; Confidence: number; BoundingBox: BoundingBox; };
type DetectionResult = { imageId: string; original_image_url: string; detected_objects: DetectedObject[]; };

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [results, setResults] = useState<DetectionResult | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // This effect hook will run whenever the 'results' state changes
  useEffect(() => {
    if (results && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = new Image();
      // Important: The image URL from S3 must be accessible. This requires the GET CORS rule.
      img.crossOrigin = "Anonymous"; 
      img.src = results.original_image_url;
      
      img.onload = () => {
        // Scale canvas to image dimensions
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        
        // Draw the original image on the canvas
        ctx.drawImage(img, 0, 0);

        // Draw the bounding boxes
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 4;
        ctx.font = '20px Arial';
        ctx.fillStyle = 'red';

        results.detected_objects.forEach(obj => {
          const { BoundingBox: bbox, Label, Confidence } = obj;
          const x = bbox.Left * canvas.width;
          const y = bbox.Top * canvas.height;
          const width = bbox.Width * canvas.width;
          const height = bbox.Height * canvas.height;

          // Draw the rectangle
          ctx.strokeRect(x, y, width, height);
          
          // Draw the label text
          const labelText = `${Label} (${Confidence.toFixed(2)}%)`;
          ctx.fillText(labelText, x, y > 20 ? y - 5 : 20);
        });
      };
      
      img.onerror = () => {
        setMessage("Error loading image from S3. Check S3 CORS permissions for GET.");
      }
    }
  }, [results]); // Dependency array: this code runs when 'results' is updated

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setResults(null); // Clear previous results
    setMessage('');
    if (e.target.files) setFile(e.target.files[0]);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setMessage('Uploading image...');

    try {
      const presignedResponse = await fetch('/api/s3/generate-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      });
      if (!presignedResponse.ok) throw new Error('Failed to get presigned URL.');
      const { url, fields, key } = await presignedResponse.json();
      
      const formData = new FormData();
      Object.entries(fields).forEach(([key, value]) => formData.append(key, value as string));
      formData.append('file', file);
      
      const uploadResponse = await fetch(url, { method: 'POST', body: formData });
      if (!uploadResponse.ok) throw new Error('S3 upload failed.');
      
      setMessage('Upload successful. Processing image...');
      setIsPolling(true);
      pollForResults(key);
    } catch (error) {
      handleError(error);
    } finally {
      setUploading(false);
    }
  };

  const pollForResults = (key: string) => {
    const intervalId = setInterval(async () => {
      try {
        const encodedKey = encodeURIComponent(key);
        const resultResponse = await fetch(`/api/results/${encodedKey}`);
        
        if (resultResponse.ok) {
          const data: DetectionResult = await resultResponse.json();
          setResults(data);
          setMessage('Analysis complete!');
          setIsPolling(false);
          clearInterval(intervalId);
        }
      } catch (error) { console.error('Polling error:', error); }
    }, 3000);

    setTimeout(() => {
      if (isPolling) {
        clearInterval(intervalId);
        setIsPolling(false);
        setMessage('Processing timed out.');
      }
    }, 120000);
  };
  
  const handleError = (error: unknown) => {
    setMessage(`An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`);
    setUploading(false);
    setIsPolling(false);
  };

  return (
    <main className={styles.main}>
      <div className={styles.description}>
        <h1>Image Label and Bounding Box Generator</h1>
        <p>Using AWS Rekognition, S3, Lambda, and DynamoDB</p>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        <input 
          id="file-input" type="file" accept="image/png, image/jpeg" 
          onChange={handleFileChange} disabled={uploading || isPolling}
        />
        <button type="submit" disabled={uploading || isPolling || !file}>
          {isPolling ? 'Processing...' : uploading ? 'Uploading...' : 'Analyze Image'}
        </button>
      </form>
      
      {message && <p className={styles.message}>{message}</p>}

      {results && (
        <div className={styles.resultsContainer}>
          <h2>Analysis Results</h2>
          <canvas ref={canvasRef} className={styles.annotatedImage} />
        </div>
      )}
    </main>
  );
}