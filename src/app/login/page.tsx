// src/app/login/page.tsx
"use client";

import { useSession, signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from './page.module.css'; // Optional: if you have styles for this page

export default function LoginPage() {
  const { status } = useSession();
  const router = useRouter();
  const [messageParagraph, setMessageParagraph] = useState("");
  const [messageHeader, setMessageHeader] = useState("");

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
      setMessageHeader("You are already signed in.");
      setMessageParagraph("Redirecting to the home page...");
    }
    else if (status === "unauthenticated") {
      setMessageHeader("You have been signed out.");
      setMessageParagraph("Please sign in to continue.");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className={styles.loadingContainer}>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className={styles.loginContainer}>
      <div className={styles.innerContent}>
        <h1 className={styles.loginMessage}>{messageHeader}</h1>
        <p className={styles.paragraph}>{messageParagraph}</p>
        {status === "unauthenticated" && (
          <button
            onClick={() => signIn("cognito")}
            className={styles.loginButton}
          >
            Sign In
          </button>
        )}
      </div>
    </div>
  );
}