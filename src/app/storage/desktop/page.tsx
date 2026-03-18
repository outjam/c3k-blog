"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BackButtonController } from "@/components/back-button-controller";
import {
  fetchDesktopRuntimeContract,
  openTonSiteInDesktop,
} from "@/lib/desktop-runtime-api";
import type { C3kDesktopRuntimeContract } from "@/types/desktop";

import styles from "./page.module.scss";

function DesktopRuntimeSkeleton() {
  return (
    <div className={styles.skeletonStack} aria-hidden="true">
      <section className={styles.skeletonHero} />
      <section className={styles.skeletonGrid}>
        <span />
        <span />
        <span />
      </section>
      <section className={styles.skeletonList}>
        <span />
        <span />
        <span />
        <span />
      </section>
    </div>
  );
}

export default function StorageDesktopPage() {
  const router = useRouter();

  const [runtime, setRuntime] = useState<C3kDesktopRuntimeContract | null>(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    const timerId = window.setTimeout(() => {
      void fetchDesktopRuntimeContract().then((response) => {
        if (!mounted) {
          return;
        }

        setRuntime(response.runtime);
        setError(response.error ?? "");
        setBootLoading(false);
      });
    }, 0);

    return () => {
      mounted = false;
      window.clearTimeout(timerId);
    };
  }, []);

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/storage");
  };

  const handleOpenTonSite = () => {
    const target = openTonSiteInDesktop(runtime);
    setMessage(`Пытаемся открыть c3k.ton через ${target.deepLink}`);
  };

  return (
    <div className={styles.page}>
      <BackButtonController onBack={handleBack} />

      <main className={styles.container}>
        <section className={styles.hero}>
          <div className={styles.heroTop}>
            <button type="button" className={styles.backButton} onClick={handleBack}>
              Назад
            </button>
            <span className={styles.heroChip}>Desktop beta</span>
          </div>

          <div className={styles.heroBody}>
            <div className={styles.heroMeta}>
              <h1>C3K Desktop Client</h1>
              <p>
                Единый desktop runtime для storage node, локального gateway и
                открытия <code>c3k.ton</code>.
              </p>
            </div>

            <div className={styles.heroStats}>
              <article>
                <span>Gateway</span>
                <strong>
                  {runtime ? `${runtime.gateway.host}:${runtime.gateway.port}` : "—"}
                </strong>
              </article>
              <article>
                <span>TON Site</span>
                <strong>{runtime?.gateway.tonSiteHost ?? "c3k.ton"}</strong>
              </article>
              <article>
                <span>Статус</span>
                <strong>
                  {runtime?.features.desktopClientEnabled ? "Enabled" : "Scaffold"}
                </strong>
              </article>
            </div>
          </div>
        </section>

        {bootLoading ? <DesktopRuntimeSkeleton /> : null}
        {error ? <div className={styles.noticeError}>{error}</div> : null}
        {message ? <div className={styles.noticeSuccess}>{message}</div> : null}

        {!bootLoading && runtime ? (
          <>
            <section className={styles.group}>
              <div className={styles.groupHeading}>
                <h2>Что уже зафиксировано</h2>
                <p>
                  Это первый runtime contract для desktop-клиента. Он нужен, чтобы
                  web, Electron shell и local gateway смотрели в одну конфигурацию.
                </p>
              </div>

              <div className={styles.infoGrid}>
                <article className={styles.infoCard}>
                  <span>App scheme</span>
                  <strong>{runtime.appScheme}://</strong>
                </article>
                <article className={styles.infoCard}>
                  <span>Runtime API</span>
                  <strong>{runtime.runtimeUrl ?? "pending public origin"}</strong>
                </article>
                <article className={styles.infoCard}>
                  <span>Storage program</span>
                  <strong>{runtime.storageProgramUrl ?? "/storage"}</strong>
                </article>
              </div>
            </section>

            <section className={styles.group}>
              <div className={styles.groupHeading}>
                <h2>Onboarding node</h2>
                <p>
                  На beta-этапе мы не запускаем реальный paid runtime. Здесь фиксируется
                  user path и локальная конфигурация для следующего desktop slice.
                </p>
              </div>

              <div className={styles.stepList}>
                {runtime.onboarding.steps.map((step, index) => (
                  <article key={step.id} className={styles.stepCard}>
                    <span className={styles.stepIndex}>{index + 1}</span>
                    <div>
                      <strong>{step.title}</strong>
                      <p>{step.description}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className={styles.group}>
              <div className={styles.groupHeading}>
                <h2>Действия</h2>
                <p>
                  Это первые тестовые entry points для будущего desktop-клиента и local
                  gateway.
                </p>
              </div>

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={handleOpenTonSite}
                >
                  Открыть c3k.ton
                </button>
                <a
                  className={styles.secondaryLink}
                  href={runtime.runtimeUrl ?? "/api/desktop/runtime"}
                  target="_blank"
                  rel="noreferrer"
                >
                  Runtime JSON
                </a>
                <a
                  className={styles.secondaryLink}
                  href={`${runtime.gateway.baseUrl}/health`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Gateway health
                </a>
                <Link href="/storage" className={styles.secondaryLink}>
                  Вернуться в Storage
                </Link>
              </div>
            </section>

            <section className={styles.group}>
              <div className={styles.groupHeading}>
                <h2>Режим beta</h2>
                <p>
                  Сейчас это test-first контур без обязательного реального TON Storage
                  runtime и без production-сети.
                </p>
              </div>

              <div className={styles.statusList}>
                <article className={styles.statusCard}>
                  <span>Поддержка ОС</span>
                  <strong>{runtime.onboarding.supportedPlatforms.join(" · ")}</strong>
                </article>
                <article className={styles.statusCard}>
                  <span>Минимум диска</span>
                  <strong>{runtime.onboarding.minRecommendedDiskGb} GB</strong>
                </article>
                <article className={styles.statusCard}>
                  <span>Цель для beta</span>
                  <strong>{runtime.onboarding.targetDiskGb} GB</strong>
                </article>
              </div>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
