"use client";

import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import styles from "./Header.module.css";

export default function Header() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  const isDemoRoute = pathname.startsWith("/demo");

  return (
    <header className={styles.header}>
      <div
        className={styles.logo}
        onClick={() => router.push("/")}
        role="button"
      >
        Image Label Generator
      </div>

      <div className={styles.userSection}>
        {isDemoRoute && session?.user && (
          <button
            className={styles.ctaButton}
            onClick={() => router.push("/login")}
          >
            Sign up for more features
          </button>
        )}

        {!isDemoRoute && session?.user && (
          <>
            <p className={styles.welcomeText}>
              Hello, {session.user.username}
            </p>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className={styles.signOutButton}
            >
              Sign Out
            </button>
          </>
        )}
      </div>
    </header>
  );
}
