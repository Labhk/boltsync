import { SessionProvider } from "next-auth/react";
import Head from "next/head";
import "../styles/globals.css";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";

// Initialize PostHog client-side
if (typeof window !== "undefined") {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    person_profiles: "identified_only",
    loaded: (posthog) => {
      if (process.env.NODE_ENV === "development") posthog.debug();
    },
  });
}

export default function App({ Component, pageProps: { session, ...pageProps } }) {
  return (
    <>
      <Head>
        {/* Primary Meta Tags */}
        <title>BoltSync - GitHub Repository Management with AI</title>
        <meta name="title" content="BoltSync - GitHub Repository Management with AI" />
        <meta name="description" content="Modify your GitHub repositories with Bolt Prompts & sync changes back to GitHub with BoltSync. Streamline your development workflow with AI-powered repository management." />
        
        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://boltsync.dev" />
        <meta property="og:title" content="BoltSync - GitHub Repository Management with AI" />
        <meta property="og:description" content="Modify your GitHub repositories with Bolt Prompts & sync changes back to GitHub with BoltSync. Streamline your development workflow with AI-powered repository management." />
        <meta property="og:image" content="https://boltsync.dev/og-image.png" />

        {/* Twitter */}
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:url" content="https://boltsync.dev" />
        <meta property="twitter:title" content="BoltSync - GitHub Repository Management with AI" />
        <meta property="twitter:description" content="Modify your GitHub repositories with Bolt Prompts & sync changes back to GitHub with BoltSync. Streamline your development workflow with AI-powered repository management." />
        <meta property="twitter:image" content="https://boltsync.dev/og-image.png" />

        {/* Microsoft Clarity */}
        <script
          type="text/javascript"
          dangerouslySetInnerHTML={{
            __html: `
              (function(c,l,a,r,i,t,y){
                c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
              })(window, document, "clarity", "script", "oyu4uyt6sn");
            `,
          }}
        />

        {/* Matomo */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              var _paq = window._paq = window._paq || [];
              _paq.push(['trackPageView']);
              _paq.push(['enableLinkTracking']);
              (function() {
                var u="https://mystify.matomo.cloud/";
                _paq.push(['setTrackerUrl', u+'matomo.php']);
                _paq.push(['setSiteId', '1']);
                var d=document, g=d.createElement('script'), s=d.getElementsByTagName('script')[0];
                g.async=true; g.src='https://cdn.matomo.cloud/mystify.matomo.cloud/matomo.js'; 
                s.parentNode.insertBefore(g,s);
              })();
            `,
          }}
        />
      </Head>

      <PostHogProvider client={posthog}>
        <SessionProvider session={session}>
          <Component {...pageProps} />
        </SessionProvider>
      </PostHogProvider>
    </>
  );
}
