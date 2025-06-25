// src/app/page.tsx
"use client";

// import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, ChangeEvent, FormEvent, useRef, useEffect } from 'react';
import styles from './page.module.css';
import axios, { AxiosProgressEvent } from 'axios';

type BoundingBox = { Width: number; Height: number; Left: number; Top: number; };
type DetectedObject = { Label: string; Confidence: number; BoundingBox: BoundingBox; };
type DetectionResult = {
    imageId: string;
    s3_bucket: string;
    s3_processed_key: string;
    detected_objects: DetectedObject[];
    processed_image_url: string;
};

export default function Home() {
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [message, setMessage] = useState('');
    const [results, setResults] = useState<DetectionResult | null>(null);
    const [isPolling, setIsPolling] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    // const { status } = useSession();
    const router = useRouter();

    useEffect(() => {
        // if (status === "unauthenticated") {
        //     router.replace("/login");
        // }

        if (results && canvasRef.current) {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.src = results.processed_image_url;

            img.onload = () => {
                const fixedWidth = 800;
                const aspectRatio = img.naturalHeight / img.naturalWidth;
                canvas.width = fixedWidth;
                canvas.height = fixedWidth * aspectRatio;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

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
                    ctx.strokeRect(x, y, width, height);
                    const labelText = `${Label} (${Confidence.toFixed(2)}%)`;
                    ctx.fillText(labelText, x, y > 20 ? y - 5 : 20);
                });
            };
            img.onerror = () => setMessage("Error loading processed image from S3.");
        }
    }, [results, router]);

    const handleClear = () => {
        if (!results) return;

        console.log("Clearing results and triggering cleanup...");

        fetch(`/api/results`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                processedImageKey: results.s3_processed_key,
                bucket: results.s3_bucket,
            })
        })
            .then(res => res.json())
            .then(data => console.log("Cleanup response:", data))
            .catch(err => console.error("Cleanup failed:", err));

        setResults(null);
        setFile(null);
        setMessage('');
        setUploadProgress(0);
    };

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        setMessage('');
        setUploadProgress(0);

        const selectedFile = e.target.files?.[0] ? e.target.files[0] : null;

        if (!selectedFile) {
            setFile(null);
            setValidationError('No file selected.');
            return;
        }

        const MAX_SIZE_MB = 10;
        const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
        const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/jpg'];

        if (!ALLOWED_TYPES.includes(selectedFile.type)) {
            setValidationError('Invalid file type. Please upload a JPG or PNG.');
        } else if (selectedFile.size > MAX_SIZE_BYTES) {
            setValidationError(`File size exceeds ${MAX_SIZE_MB} MB limit.`);
        } else {
            setValidationError(null);
        }

        setFile(selectedFile);
    };

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!file || validationError) return;
        setUploading(true);
        setUploadProgress(0);
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
            Object.entries(fields).forEach(([k, v]) => formData.append(k, v as string));
            formData.append('file', file);

            await axios.post(url, formData, {
                onUploadProgress: (progressEvent: AxiosProgressEvent) => {
                    if (progressEvent.total) {
                        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                        setUploadProgress(percent);
                    }
                }
            });

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
        const encodedKey = encodeURIComponent(key);
        const intervalId = setInterval(async () => {
            try {
                const resultResponse = await fetch(`/api/results?id=${encodedKey}`);
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

            {!results ? (
                <>
                    <form onSubmit={handleSubmit} className={styles.form}>
                        <label htmlFor="file-input" className={styles.label}>Select an image:</label>
                        <input
                            id="file-input" type="file" accept="image/png, image/jpeg"
                            onChange={handleFileChange}
                            disabled={uploading || isPolling}
                        />
                        <button
                            type="submit"
                            className={styles.button}
                            disabled={!file || !!validationError || uploading || isPolling}
                        >
                            {isPolling ? 'Processing...' : uploading ? 'Uploading...' : 'Analyze Image'}
                        </button>
                    </form>

                    {validationError && (
                        <p className={styles.errorMessage}>
                            {validationError}
                        </p>
                    )}

                    {uploading && !isPolling && (
                        <div className={styles.progressContainer}>
                            <p>Uploading: {uploadProgress}%</p>
                            <progress className={styles.progressBar} value={uploadProgress} max="100" />
                        </div>
                    )}
                </>
            ) : (
                <div className={styles.resultsContainer}>
                    <h2>Analysis Results</h2>
                    <canvas ref={canvasRef} className={styles.annotatedImage} />
                    <button onClick={handleClear} className={styles.clearButton}>
                        Analyze Another Image
                    </button>
                </div>
            )}

            {message && <p className={styles.message}>{message}</p>}
        </main>
    );
}