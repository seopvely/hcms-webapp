import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hankyeul.hcms',
  appName: 'HCMS Customer',
  webDir: 'out',
  server: {
    url: 'http://localhost:8011',
    cleartext: true,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
