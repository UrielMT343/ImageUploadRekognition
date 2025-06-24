// src/app/login/page.tsx
"use client";

import { useSession, signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from './page.module.css';

export default function LoginPage() {
  const { status } = useSession();
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (status === "loading") {
      return;
    }

    if (status === "authenticated") {
      router.replace("/");
      setMessage("You are already logged in.")
    }

    if (status === "unauthenticated") {
      signIn("cognito");
      setMessage("Redirecting to sign in...")
    }
  }, [status, router]);

  return (
    <div className={styles.loginContainer}>
      <div>
        <h1 className={styles.loginMessage}>
          {message || "Redirecting to sign in..."}
        </h1>
      </div>
    </div>
  );
}