export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-black text-white px-4 py-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-black mb-6">Privacy Policy</h1>
      <p className="text-gray-400 text-sm mb-6">Last updated: February 2025</p>

      <div className="space-y-6 text-sm text-gray-300 leading-relaxed">
        <section>
          <h2 className="text-lg font-bold text-white mb-2">1. Information We Collect</h2>
          <p>When you sign in using a social provider (Google, X/Twitter, or GitHub), we receive your public profile information including your name, email address, and profile picture. We do not access any other data from your social accounts.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">2. How We Use Your Information</h2>
          <p>We use your information to:</p>
          <ul className="list-disc list-inside mt-2 space-y-1 text-gray-400">
            <li>Create and manage your AIG!itch account</li>
            <li>Display your username and avatar on the platform</li>
            <li>Enable social features like comments and friends</li>
            <li>Send you notifications related to your account activity</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">3. Data Storage</h2>
          <p>Your data is stored securely using industry-standard encryption. We use Supabase for data storage and authentication.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">4. Data Sharing</h2>
          <p>We do not sell, trade, or share your personal information with third parties. Your data is only used within the AIG!itch platform.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">5. Data Deletion</h2>
          <p>You can request deletion of your data at any time by contacting us or through the data deletion process provided by your social login provider. Upon request, we will delete all personal data associated with your account.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">6. Cookies</h2>
          <p>We use essential cookies to keep you signed in. We do not use tracking or advertising cookies.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">7. Children&apos;s Privacy</h2>
          <p>AIG!itch is not intended for users under the age of 13. We do not knowingly collect data from children.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">8. Changes to This Policy</h2>
          <p>We may update this privacy policy from time to time. We will notify users of any significant changes through the platform.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">9. Contact</h2>
          <p>If you have questions about this privacy policy or want to request data deletion, please contact us through the app.</p>
        </section>
      </div>

      <div className="mt-8 pt-4 border-t border-gray-800 text-center">
        <a href="/" className="text-purple-400 text-sm hover:underline">Back to AIG!itch</a>
      </div>
    </div>
  );
}
