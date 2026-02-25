"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { Device } from "@capacitor/device";
import api from "@/lib/axios";

const PUSH_TOKEN_KEY = "push_token";
const PUSH_TOKEN_REGISTERED_KEY = "push_token_registered";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

async function sendTokenToServer(
  token: string,
  platform: "ios" | "android",
  deviceId: string | null = null,
  retries = MAX_RETRIES
): Promise<boolean> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      console.log(
        `[Push] Sending token to server (attempt ${attempt + 1}/${retries})`
      );
      await api.post("/push/register", {
        token,
        platform,
        device_id: deviceId,
      });
      console.log("[Push] Token registered on server");
      localStorage.setItem(PUSH_TOKEN_REGISTERED_KEY, "true");
      return true;
    } catch (err: unknown) {
      const error = err as { response?: { status?: number; data?: unknown }; message?: string };
      console.error(
        `[Push] Server registration failed (${attempt + 1}/${retries}):`,
        error?.response?.status,
        error?.response?.data || error?.message
      );
      if (attempt < retries - 1) {
        await new Promise((r) =>
          setTimeout(r, BASE_DELAY_MS * Math.pow(2, attempt))
        );
      }
    }
  }
  return false;
}

/**
 * 푸시 권한 요청 → 토큰 발급 → 서버 등록.
 * 로그인 성공 직후 호출한다.
 */
export async function requestAndRegisterPushToken(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    console.log("[Push] Not a native platform, skipping");
    return;
  }

  try {
    console.log("[Push] Requesting permissions...");
    const perm = await PushNotifications.requestPermissions();
    console.log("[Push] Permission result:", perm.receive);
    if (perm.receive !== "granted") return;

    let resolveToken: (value: string) => void;
    let rejectToken: (reason?: unknown) => void;
    const tokenPromise = new Promise<string>((resolve, reject) => {
      resolveToken = resolve;
      rejectToken = reject;
    });

    const timeout = setTimeout(() => {
      console.error("[Push] Token registration timed out (15s)");
      rejectToken!(new Error("Push token timeout"));
    }, 15000);

    console.log("[Push] Adding registration listeners...");
    await PushNotifications.addListener("registration", ({ value }) => {
      console.log("[Push] Token received:", value.substring(0, 20) + "...");
      clearTimeout(timeout);
      resolveToken!(value);
    });
    await PushNotifications.addListener("registrationError", (err) => {
      console.error("[Push] Registration error from native:", err);
      clearTimeout(timeout);
      rejectToken!(err);
    });

    console.log("[Push] Calling PushNotifications.register()...");
    await PushNotifications.register();

    const token = await tokenPromise;
    const platform = Capacitor.getPlatform() as "ios" | "android";
    const { identifier } = await Device.getId();
    console.log("[Push] Platform:", platform, "Device ID:", identifier);

    localStorage.setItem(PUSH_TOKEN_KEY, token);
    localStorage.removeItem(PUSH_TOKEN_REGISTERED_KEY);

    await sendTokenToServer(token, platform, identifier);
  } catch (err) {
    console.error("[Push] requestAndRegisterPushToken failed:", err);
  }
}

/**
 * 인증 레이아웃에서 호출.
 * 미등록 토큰 재시도 + 알림 리스너 설정.
 */
export function usePushNotifications() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const savedToken = localStorage.getItem(PUSH_TOKEN_KEY);
    const isRegistered =
      localStorage.getItem(PUSH_TOKEN_REGISTERED_KEY) === "true";

    if (savedToken && !isRegistered) {
      console.log("[Push] Hook: retrying server registration for saved token");
      const platform = Capacitor.getPlatform() as "ios" | "android";
      Device.getId().then(({ identifier }) => {
        sendTokenToServer(savedToken, platform, identifier);
      });
    }

    PushNotifications.addListener(
      "pushNotificationReceived",
      (notification) => {
        console.log("[Push] Notification received:", notification);
      }
    );

    PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (action) => {
        console.log("[Push] Action performed:", action);
      }
    );

    return () => {
      PushNotifications.removeAllListeners();
    };
  }, []);
}

