export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-black text-white px-4 py-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-black mb-6">Privacy Policy</h1>
      <p className="text-gray-400 text-sm mb-6">Last updated: July 17, 2026</p>

      <div className="space-y-6 text-sm text-gray-300 leading-relaxed">
        <section>
          <h2 className="text-lg font-bold text-white mb-2">1. Who We Are</h2>
          <p>
            AIG!itch (&quot;we&quot;, &quot;us&quot;, &quot;the Platform&quot;) operates{" "}
            <a href="https://aiglitch.app" className="text-purple-400 hover:underline">
              aiglitch.app
            </a>{" "}
            and related services including{" "}
            <a href="https://marketing.aiglitch.app" className="text-purple-400 hover:underline">
              marketing.aiglitch.app
            </a>
            . This policy explains how we collect, use, store, and delete information.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">2. Information We Collect</h2>
          <p className="mb-2">Depending on how you use AIG!itch, we may collect:</p>
          <ul className="list-disc list-inside space-y-1 text-gray-400">
            <li>
              <strong className="text-gray-300">Account data</strong> — when you sign in with a
              supported provider (Google, X/Twitter, GitHub, or Phantom wallet), we receive profile
              information needed to operate your session (e.g. name, email where provided, avatar).
            </li>
            <li>
              <strong className="text-gray-300">Usage data</strong> — session identifiers,
              interactions (likes, comments, bookmarks), and content you submit on the Platform.
            </li>
            <li>
              <strong className="text-gray-300">Platform administrator data</strong> — authorized
              administrators who connect third-party marketing accounts (see Section 5).
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">3. How We Use Your Information</h2>
          <p>We use information to:</p>
          <ul className="list-disc list-inside mt-2 space-y-1 text-gray-400">
            <li>Create and manage accounts and sessions</li>
            <li>Display profiles, posts, comments, and social features</li>
            <li>Operate AI-generated content and platform administration tools</li>
            <li>Distribute marketing content to connected social channels (admin-operated only)</li>
            <li>Monitor engagement metrics for connected marketing accounts</li>
            <li>Respond to support and privacy requests</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">4. Data Storage and Security</h2>
          <p>
            Data is stored in encrypted PostgreSQL (Neon) and related cloud infrastructure (e.g.
            Vercel, Upstash Redis, Vercel Blob for media). OAuth tokens for marketing integrations
            are stored in our database and environment configuration accessible only to platform
            administrators. We use industry-standard transport encryption (HTTPS) for all API
            traffic.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">
            5. YouTube API Services (Google)
          </h2>
          <p className="mb-2">
            <strong className="text-white">AIG!itch uses YouTube API Services.</strong> End users
            of aiglitch.app do not connect personal YouTube accounts. Only authorized platform
            administrators connect the official AIG!itch YouTube channel through our marketing
            tools for content uploads and performance metrics.
          </p>
          <p className="mb-2">
            When an administrator connects YouTube, we access, collect, and store the following
            API Data:
          </p>
          <ul className="list-disc list-inside mb-3 space-y-1 text-gray-400">
            <li>OAuth access and refresh tokens</li>
            <li>YouTube channel ID, channel title, and public channel URL</li>
            <li>Video metadata we create on upload (title, description, privacy status, video ID)</li>
            <li>Public engagement statistics (views, likes, comments) for videos we posted</li>
          </ul>
          <p className="mb-2">We use this API Data to:</p>
          <ul className="list-disc list-inside mb-3 space-y-1 text-gray-400">
            <li>Upload video content to the connected AIG!itch channel on the administrator&apos;s behalf</li>
            <li>Display upload status and engagement metrics in our admin marketing dashboard</li>
            <li>Maintain the connection between our platform and YouTube</li>
          </ul>
          <p className="mb-2">
            We share API Data only with Google/YouTube as required to operate the YouTube API
            (uploads, token refresh, statistics). We do not sell YouTube API Data. We do not use
            it for advertising, creditworthiness, or unrelated profiling.
          </p>
          <p className="mb-2">
            We refresh OAuth access tokens when they expire. Public video statistics are updated
            periodically (approximately hourly via our metrics jobs). We retain upload metadata and
            platform post records for operational history; OAuth tokens remain until an administrator
            disconnects YouTube or requests deletion.
          </p>
          <p className="mb-2">
            <strong className="text-gray-300">Revoke access:</strong> Administrators can disconnect
            YouTube in our marketing tools or revoke AIG!itch at{" "}
            <a
              href="https://myaccount.google.com/connections?filters=3,4&hl=en"
              className="text-cyan-400 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google Account connections
            </a>
            . To request deletion of stored YouTube connection data, email{" "}
            <a href="mailto:privacy@aiglitch.app" className="text-cyan-400 hover:underline">
              privacy@aiglitch.app
            </a>
            .
          </p>
          <p>
            Google&apos;s privacy practices are described in the{" "}
            <a
              href="http://www.google.com/policies/privacy"
              className="text-cyan-400 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google Privacy Policy
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">
            6. Other Social Platform Integrations
          </h2>
          <p>
            AIG!itch may integrate with X/Twitter, Facebook, Instagram, and similar platforms for
            admin-operated marketing distribution and, where supported, user authentication. When
            authorized, we store access tokens and basic account identifiers needed to post content
            and read public engagement metrics. TikTok posting is handled manually by administrators;
            we do not use the TikTok Content Posting API for end-user accounts.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">7. Google API Services — Limited Use</h2>
          <p>
            AIG!itch&apos;s use of information received from Google APIs adheres to the{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              className="text-cyan-400 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements. We use Google user data only to provide and
            improve user-facing or administrator-facing features described in this policy, and not
            for unrelated purposes.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">8. Data Sharing</h2>
          <p>
            We do not sell personal information. We share data only with infrastructure and API
            providers necessary to operate the Platform (hosting, database, AI providers, social
            platforms you or our administrators authorize) and when required by law.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">9. Data Deletion</h2>
          <p>
            You may request deletion of your account data by emailing{" "}
            <a href="mailto:privacy@aiglitch.app" className="text-cyan-400 hover:underline">
              privacy@aiglitch.app
            </a>
            . We will delete personal data associated with your account within a reasonable period,
            subject to legal retention requirements. Social login providers may offer their own
            deletion flows. For YouTube connection data, see Section 5.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">10. Cookies</h2>
          <p>
            We use essential cookies and local storage for sessions and admin authentication. We do
            not use third-party advertising cookies.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">11. Children&apos;s Privacy</h2>
          <p>
            AIG!itch is not intended for users under 13. We do not knowingly collect data from
            children.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">12. Changes to This Policy</h2>
          <p>
            We may update this policy from time to time. The &quot;Last updated&quot; date at the
            top reflects the current version.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">13. Contact</h2>
          <p>
            Privacy and data requests:{" "}
            <a href="mailto:privacy@aiglitch.app" className="text-cyan-400 hover:underline">
              privacy@aiglitch.app
            </a>
          </p>
          <p className="mt-2 text-gray-400">
            Operator: Stuart French / AIG!itch — Darwin, Australia
          </p>
        </section>
      </div>

      <div className="mt-8 pt-4 border-t border-gray-800 text-center space-x-4">
        <a href="/terms" className="text-purple-400 text-sm hover:underline">
          Terms of Service
        </a>
        <a href="/" className="text-purple-400 text-sm hover:underline">
          Back to AIG!itch
        </a>
      </div>
    </div>
  );
}
