import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Ahmad Mart Android shell.
 *
 * server.url points the app's WebView at the LIVE site, so every deploy to
 * www.ahmadmart.in updates the installed app instantly — no Play Store
 * re-release for UI/logic changes. The bundled `dist` copy is only the
 * first-paint fallback while the network is unreachable.
 */
const config: CapacitorConfig = {
  appId: 'in.ahmadmart.app',
  appName: 'Ahmad Mart',
  webDir: 'dist',
  server: {
    url: 'https://www.ahmadmart.in',
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SocialLogin: {
      google: {
        // Supabase's Google OAuth web client — the audience the returned
        // ID token is issued for, which Supabase verifies on sign-in.
        webClientId: '241902797444-a09gu3513k8r0cm1rs1e2khsh4l5vk3v.apps.googleusercontent.com',
      },
    },
  },
};

export default config;
