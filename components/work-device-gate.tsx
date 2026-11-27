"use client";

import { useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { translateText, useLanguage } from "@/components/language-provider";
import { isSupportedWorkDevice } from "@/lib/work-device";
import type { ReactNode } from "react";

function getWorkDeviceSnapshot() {
  return isSupportedWorkDevice({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    screenWidth: window.screen.width,
  });
}

function subscribeToWorkDevice(onChange: () => void) {
  window.addEventListener("resize", onChange);
  window.addEventListener("orientationchange", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    window.removeEventListener("orientationchange", onChange);
  };
}

export function WorkDeviceGate({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  const isSupportedDevice = useSyncExternalStore(
    subscribeToWorkDevice,
    getWorkDeviceSnapshot,
    () => true,
  );
  const t = (text: string) => translateText(text, language);

  if (isSupportedDevice) return children;

  return (
    <main className="device-requirement-page">
      <section
        aria-labelledby="device-requirement-title"
        className="device-requirement-card"
      >
        <Link
          aria-label={t("DRIKAPEX INTERNAL")}
          className="brand device-requirement-brand"
          href="/drikapex-group-website.html"
        >
          <Image
            alt=""
            className="brand__symbol"
            height={40}
            priority
            src="/office.png"
            width={40}
          />
          <span className="brand__wordmark">
            DRIKAPEX
            <small>{t("INTERNAL")}</small>
          </span>
        </Link>
        <span className="eyebrow">{t("WORKSPACE DEVICE REQUIREMENT")}</span>
        <span className="device-requirement-card__icon" aria-hidden="true">
          ▰
        </span>
        <h2 id="device-requirement-title">
          {t("Work from a PC or tablet.")}
        </h2>
        <p>
          {t("The internal workspace is available on PCs, laptops and tablets. Please open this page on one of these devices to continue.")}
        </p>
        <Link
          className="button button--primary device-requirement-home-button"
          href="/drikapex-group-website.html"
        >
          {t("Back to homepage")}
        </Link>
        <span className="device-requirement-card__list-label">
          {t("Supported devices")}
        </span>
        <div className="device-requirement-card__devices">
          <span>
            <span aria-hidden="true">▱</span>
            {t("PC or laptop")}
          </span>
          <span>
            <span aria-hidden="true">▣</span>
            {t("Tablet")}
          </span>
        </div>
      </section>
    </main>
  );
}
