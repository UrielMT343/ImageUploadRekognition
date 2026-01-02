"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, ChangeEvent, FormEvent, useRef, useEffect } from 'react';
import styles from './page.module.css';
import axios, { AxiosProgressEvent } from 'axios';
import RecentImagesCarousel, { RecentImage } from "./components/RecentImagesCarousel";

type BoundingBox = {
    Width: number;
    Height: number;
    Left: number;
    Top: number;
};
type DetectedObject = {
    Label: string;
    Confidence: number;
    BoundingBox: BoundingBox;
};
type DetectionResult = {
    imageId: string;
    s3_bucket: string;
    s3_processed_key: string;
    s3_original_key: string;
    detected_objects: DetectedObject[];
    processed_image_url: string;
};
type AnalyzeResult = {
    w: number;
    h: number;
    mp: number;
    recommendEnhance: boolean;
    reason: string;
};

export default function Home() {
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [message, setMessage] = useState('');
    const [results, setResults] = useState<DetectionResult | null>(null);
    const [isPolling, setIsPolling] = useState(false);
    const [isEnhanced, setIsEnhanced] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);
    const [items, setItems] = useState<RecentImage[]>([]);
    const [isThumbnail, setIsThumbnail] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const { status } = useSession();
    const router = useRouter();

    useEffect(() => {
        if (!results) return;
        fetchThumbnails();
    }, [results]);

    useEffect(() => {
        if (status === "unauthenticated") {
            router.replace("/login");
            return;
        }
        if (status !== "authenticated") return;

        if (items.length === 0) {
            fetchThumbnails();
        }
    }, [status, router, items.length]);

    useEffect(() => {
        if (!results) return;
        if (!canvasRef.current) return;

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
            canvas.height = fixedWidth * aspectRatio;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            ctx.strokeStyle = "red";
            ctx.lineWidth = 4;
            ctx.font = "20px Arial";
            ctx.fillStyle = "red";

            results.detected_objects.forEach((obj) => {
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

        return () => {
            img.onload = null;
            img.onerror = null;
        };
    }, [results]);


    const handleClear = () => {
        if (!results) return;

        if (!isThumbnail) {
            try {
                console.log("Clearing results and triggering cleanup...");

                fetch(`/api/results`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        processedImageKey: results.s3_original_key,
                        bucket: results.s3_bucket,
                    })
                })
                    .then(res => res.json())
                    .then(data => console.log("Cleanup response:", data))
            } catch (error) {
                console.error("Cleanup failed:", error);
            }
        }

        setResults(null);
        setFile(null);
        setMessage('');
        setUploadProgress(0);
        setIsThumbnail(false);
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

    async function analyzeImage(file: File): Promise<AnalyzeResult> {
        const url = URL.createObjectURL(file);
        const img = new Image();

        const { w, h } = await new Promise<{ w: number; h: number }>((resolve, reject) => {
            img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
            img.onerror = reject;
            img.src = url;
        });

        URL.revokeObjectURL(url);

        const mp = (w * h) / 1_000_000;
        const minDim = Math.min(w, h);

        const MAX_MEGAPIXELS = 2.0;
        const MIN_DIM_SKIP = 1400;

        if (mp >= MAX_MEGAPIXELS) {
            return { w, h, mp, recommendEnhance: false, reason: "High resolution already" };
        }
        if (minDim >= MIN_DIM_SKIP) {
            return { w, h, mp, recommendEnhance: false, reason: "Already large and detailed" };
        }

        return { w, h, mp, recommendEnhance: true, reason: "Enhancement may help" };
    }

    const fetchThumbnails = async () => {
        try {
            const r = await fetch("/api/thumbnails?limit=20", { cache: "no-store" });
            const d = await r.json();
            setItems(d.items ?? []);
        } catch (e) {
            console.error(e);
        }
    };


    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!file || validationError) return;

        setUploading(true);
        setUploadProgress(0);
        setMessage('Preparing upload...');

        try {
            let effectiveEnhance = isEnhanced;

            if (isEnhanced) {
                const analysis = await analyzeImage(file);

                if (!analysis.recommendEnhance) {
                    effectiveEnhance = false;
                    setMessage(`Your image is already clear enough (${analysis.reason}). We'll skip enhancement to avoid unnecessary processing.`);
                }
            }

            const route = effectiveEnhance
                ? '/api/s3/generate-enhance-url'
                : '/api/s3/generate-upload-url';

            const presignedResponse = await fetch(route, {
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

            if (effectiveEnhance) {
                setMessage('Upload successful. Enhancing image... this may take 3 to 5 minutes.');
            } else {
                setMessage('Upload successful. Processing image...');
            }

            setIsPolling(true);
            pollForResults(key);

        } catch (error) {
            handleError(error);
        } finally {
            setUploading(false);
        }
    };


    const pollForResults = (key: string) => {
        const adjustedKey = isEnhanced ? key.replace(/^analysis\//, 'enhanced/') : key;
        const encodedKey = encodeURIComponent(adjustedKey);
        console.log(`Starting polling for results with key: ${encodedKey}`);
        const minutes = isEnhanced ? 7 : 2;
        const timeoutDuration = isEnhanced ? minutes * 60 * 1000 : minutes * 60 * 1000;
        const intervalDelay = isEnhanced ? 15000 : 3000;
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
        }, intervalDelay);
        setTimeout(() => {
            if (isPolling) {
                clearInterval(intervalId);
                setIsPolling(false);
                setMessage('Processing timed out.');
            }
        }, timeoutDuration);
    };

    const handleError = (error: unknown) => {
        setMessage(`An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setUploading(false);
        setIsPolling(false);
    };

    const handleEnhancedCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setIsEnhanced(e.target.checked);
    };

    return (
        <main className={styles.main}>
            <div className={styles.description}>
                <h1>Image Label and Bounding Box Generator</h1>
                <p>Event-driven image analysis using AWS Rekognition (S3, Lambda, DynamoDB)</p>
            </div>

            {!results ? (
                <div className={styles.stack}>
                    <form onSubmit={handleSubmit} className={styles.form}>
                        <label htmlFor="file-input" className={styles.label}>Select an image</label>

                        <input
                            id="file-input"
                            type="file"
                            accept="image/png, image/jpeg"
                            onChange={handleFileChange}
                            disabled={uploading || isPolling}
                        />

                        <button
                            type="submit"
                            className={styles.button}
                            disabled={!file || !!validationError || uploading || isPolling}
                        >
                            {isPolling ? "Processing..." : uploading ? "Uploading..." : "Analyze Image"}
                        </button>

                        <p className={styles.helperText}>
                            Generates labels and bounding boxes. Results are cached for quick re-open.
                        </p>

                        <div className={styles.checkboxRow}>
                            <input
                                type="checkbox"
                                id="enhance"
                                checked={isEnhanced}
                                onChange={handleEnhancedCheckboxChange}
                                disabled={uploading || isPolling}
                            />
                            <label htmlFor="enhance">Enhance image quality before analysis</label>
                        </div>

                        {(uploading || isPolling) && (
                            <div className={styles.statusRow} aria-live="polite">
                                <span className={styles.spinner} />
                                <span>
                                    {uploading && !isPolling
                                        ? `Uploading (${uploadProgress}%)`
                                        : "Running analysis (this may take a few seconds)"}
                                </span>
                            </div>
                        )}
                    </form>

                    {validationError && (
                        <p className={styles.errorMessage}>
                            {validationError}
                        </p>
                    )}

                    {uploading && !isPolling && (
                        <div className={styles.progressContainer}>
                            <progress className={styles.progressBar} value={uploadProgress} max="100" />
                        </div>
                    )}

                    {!uploading && !isPolling && (
                        <section className={styles.thumbnailSection}>
                            <div className={styles.thumbnailHeader}>
                                <h2>Or pick a recent image</h2>
                                <p className={styles.thumbnailSubtext}>Open previous results without re-uploading.</p>
                            </div>

                            <div className={styles.thumbnailCard}>
                                <RecentImagesCarousel
                                    items={items}
                                    onSelect={async (it) => {
                                        setIsThumbnail(true);
                                        const res = await fetch("/api/processed", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ key: it.processedKey }),
                                        });
                                        if (!res.ok) return;

                                        const { processedUrl, labels } = await res.json();
                                        setResults({
                                            imageId: "",
                                            s3_bucket: "",
                                            s3_processed_key: it.processedKey,
                                            s3_original_key: "",
                                            detected_objects: labels,
                                            processed_image_url: processedUrl,
                                        });
                                    }}
                                />
                            </div>
                        </section>
                    )}
                </div>
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