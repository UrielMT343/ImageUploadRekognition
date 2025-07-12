//src/app/components/Header.tsx

"use client";

import { useSession, signOut } from "next-auth/react";
import styles from './Header.module.css';

export default function Header() {
  const { data: session } = useSession();

  return (
    <header className={styles.header}>
      <div className={styles.logo}>
        Image Label Generator
      </div>
      <div className={styles.userSection}>
        {session?.user && (
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