"use client";

import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import api from "@/lib/axios";

export function usePushNotifications() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    if (!Capacitor.isNativePlatform()) return;

    initialized.current = true;

    const setupPush = async () => {
      try {
        // 권한 요청
        const permResult = await PushNotifications.requestPermissions();
        if (permResult.receive !== "granted") {
          console.log("Push notification permission denied");
          return;
        }

        // 푸시 등록
        await PushNotifications.register();

        // 토큰 수신
        PushNotifications.addListener("registration", async (token) => {
          console.log("Push token:", token.value);
          const platform = Capacitor.getPlatform() as "ios" | "android";
          try {
            await api.post("/push/register", {
              token: token.value,
              platform,
            });
          } catch (err) {
            console.error("Failed to register push token:", err);
          }
        });

        // 토큰 등록 실패
        PushNotifications.addListener("registrationError", (error) => {
          console.error("Push registration error:", error);
        });

        // 앱이 포그라운드일 때 알림 수신
        PushNotifications.addListener("pushNotificationReceived", (notification) => {
          console.log("Push received:", notification);
        });

        // 알림 탭 (앱 열기)
        PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          console.log("Push action:", action);
        });
      } catch (err) {
        console.error("Push setup error:", err);
      }
    };

    setupPush();

    return () => {
      PushNotifications.removeAllListeners();
    };
  }, []);
}
