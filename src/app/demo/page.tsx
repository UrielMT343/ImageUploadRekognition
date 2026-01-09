"use client";

import { useState, ChangeEvent, FormEvent, useRef, useEffect } from "react";
import styles from "./page.module.css";
import axios, { AxiosProgressEvent } from "axios";

type BoundingBox = { Width: number; Height: number; Left: number; Top: number };
type DetectedObject = { Label: string; Confidence: number; BoundingBox: BoundingBox };
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
    const [message, setMessage] = useState("");
    const [results, setResults] = useState<DetectionResult | null>(null);
    const [isPolling, setIsPolling] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const pollingRef = useRef<{ intervalId: number | null; timeoutId: number | null }>({
        intervalId: null,
        timeoutId: null,
    });

    const MAX_SIZE_MB = 10;
    const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
    const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/jpg"];

    useEffect(() => {
        if (!results || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = results.processed_image_url;

        img.onload = () => {
            const fixedWidth = 800;
            const aspectRatio = img.naturalHeight / img.naturalWidth;

            canvas.width = fixedWidth;
            canvas.height = Math.round(fixedWidth * aspectRatio);

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            ctx.strokeStyle = "red";
            ctx.lineWidth = 4;
            ctx.font = "18px Segoe UI";
            ctx.fillStyle = "red";

            for (const obj of results.detected_objects) {
                const { BoundingBox: bbox, Label, Confidence } = obj;
                const x = bbox.Left * canvas.width;
                const y = bbox.Top * canvas.height;
                const width = bbox.Width * canvas.width;
                const height = bbox.Height * canvas.height;

                ctx.strokeRect(x, y, width, height);

                const labelText = `${Label} (${Confidence.toFixed(2)}%)`;
                ctx.fillText(labelText, x, y > 22 ? y - 6 : 22);
            }
        };

        img.onerror = () => setMessage("Error loading processed image.");

        return () => {
            img.onload = null;
            img.onerror = null;
        };
    }, [results]);

    useEffect(() => {
        return () => stopPolling();
    }, []);

    const stopPolling = () => {
        if (pollingRef.current.intervalId) {
            clearInterval(pollingRef.current.intervalId);
            pollingRef.current.intervalId = null;
        }
        if (pollingRef.current.timeoutId) {
            clearTimeout(pollingRef.current.timeoutId);
            pollingRef.current.timeoutId = null;
        }
    };

    const handleClear = () => {
        stopPolling();
        setResults(null);
        setFile(null);
        setMessage("");
        setUploadProgress(0);
        setValidationError(null);
        setUploading(false);
        setIsPolling(false);
    };

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        setMessage("");
        setUploadProgress(0);

        const selectedFile = e.target.files?.[0] ?? null;

        if (!selectedFile) {
            setFile(null);
            setValidationError("No file selected.");
            return;
        }

        if (!ALLOWED_TYPES.includes(selectedFile.type)) {
            setValidationError("Invalid file type. Please upload a JPG or PNG.");
        } else if (selectedFile.size > MAX_SIZE_BYTES) {
            setValidationError(`File size exceeds ${MAX_SIZE_MB} MB limit.`);
        } else {
            setValidationError(null);
        }

        setFile(selectedFile);
    };

    const pollForResults = (key: string) => {
        stopPolling();
        setIsPolling(true);

        const encodedKey = encodeURIComponent(key);

        pollingRef.current.intervalId = window.setInterval(async () => {
            try {
                const resultResponse = await fetch(`/api/results?id=${encodedKey}`, { cache: "no-store" });
                if (!resultResponse.ok) return;

                const data: DetectionResult = await resultResponse.json();
                setResults(data);
                setMessage("Analysis complete.");
                setIsPolling(false);
                stopPolling();
            } catch (error) {
                console.error("Polling error:", error);
            }
        }, 3000);

        pollingRef.current.timeoutId = window.setTimeout(() => {
            stopPolling();
            setIsPolling(false);
            setMessage("Processing timed out. Please try again.");
        }, 120000);
    };

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!file || validationError) return;

        setUploading(true);
        setUploadProgress(0);
        setMessage("Uploading image...");

        try {
            const presignedResponse = await fetch("/api/s3/generate-demo-upload-url", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename: file.name, contentType: file.type }),
            });

            if (!presignedResponse.ok) throw new Error("Failed to get presigned URL.");

            const { url, fields, key } = await presignedResponse.json();

            const formData = new FormData();
            Object.entries(fields).forEach(([k, v]) => formData.append(k, v as string));
            formData.append("file", file);

            await axios.post(url, formData, {
                onUploadProgress: (progressEvent: AxiosProgressEvent) => {
                    if (progressEvent.total) {
                        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                        setUploadProgress(percent);
                    }
                },
            });

            setMessage("Upload complete. Running analysis...");
            pollForResults(key);
        } catch (error) {
            const msg = error instanceof Error ? error.message : "Unknown error";
            setMessage(`An error occurred: ${msg}`);
            stopPolling();
            setIsPolling(false);
        } finally {
            setUploading(false);
        }
    };

    const busy = uploading || isPolling;

    return (
        <main className={styles.main}>
            <header className={styles.description}>
                <h1>Image Label and Bounding Box Generator</h1>
                <p>Minimal demo: upload an image and receive labels + bounding boxes.</p>
            </header>

            {!results ? (
                <section className={styles.stack}>
                    <form onSubmit={handleSubmit} className={styles.form}>
                        <label htmlFor="file-input" className={styles.label}>
                            Select an image (JPG/PNG, up to {MAX_SIZE_MB}MB)
                        </label>

                        <input
                            id="file-input"
                            type="file"
                            accept="image/png, image/jpeg"
                            onChange={handleFileChange}
                            disabled={busy}
                        />

                        <button
                            type="submit"
                            className={styles.button}
                            disabled={!file || !!validationError || busy}
                        >
                            {isPolling ? "Processing..." : uploading ? "Uploading..." : "Analyze Image"}
                        </button>

                        {busy && (
                            <div className={styles.statusRow} aria-live="polite">
                                <span className={styles.spinner} />
                                <span>{uploading && !isPolling ? `Uploading (${uploadProgress}%)` : "Analyzing image..."}</span>
                            </div>
                        )}
                    </form>

                    {validationError && <p className={styles.errorMessage}>{validationError}</p>}

                    {uploading && !isPolling && (
                        <div className={styles.progressContainer}>
                            <progress className={styles.progressBar} value={uploadProgress} max="100" />
                        </div>
                    )}
                </section>
            ) : (
                <section className={styles.resultsContainer}>
                    <h2>Analysis Results</h2>
                    <canvas ref={canvasRef} className={styles.annotatedImage} />
                    <button onClick={handleClear} className={styles.clearButton}>
                        Analyze Another Image
                    </button>
                </section>
            )}

            {message && <p className={styles.message}>{message}</p>}
        </main>
    );
}
