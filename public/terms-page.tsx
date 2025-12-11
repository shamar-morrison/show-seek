export default function TermsOfService() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-3xl mx-auto px-5 py-10">
        <h1 className="text-4xl font-bold text-[#E50914] text-center mb-2">Terms of Service</h1>
        <p className="text-gray-400 text-center text-sm mb-10">Last Updated: December 11, 2025</p>

        <div className="bg-neutral-900 border-l-[3px] border-[#E50914] rounded-lg p-5 mb-8">
          <p>
            <strong>Welcome to ShowSeek!</strong> By using our app, you agree to these terms. Please
            read them carefully.
          </p>
        </div>

        <Section title="1. Acceptance of Terms">
          <p>
            By downloading, installing, or using ShowSeek (&quot;the App&quot;), you agree to be
            bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms,
            please do not use the App.
          </p>
          <p>
            These Terms constitute a legal agreement between you and ShowSeek (&quot;we,&quot;
            &quot;us,&quot; or &quot;our&quot;). We reserve the right to modify these Terms at any
            time, and such modifications will be effective immediately upon posting.
          </p>
        </Section>

        <Section title="2. Description of Service">
          <p>ShowSeek is a mobile application that allows users to:</p>
          <ul className="list-disc ml-6 mb-4 text-gray-300 space-y-2">
            <li>Discover and search for movies and TV shows</li>
            <li>Browse detailed information about films, television series, and cast members</li>
            <li>Create and manage personal watchlists and favorites</li>
            <li>Rate movies and TV shows</li>
            <li>Track watched episodes for TV series</li>
            <li>Receive notifications about upcoming movie releases</li>
            <li>Create custom lists to organize content</li>
          </ul>
          <p>
            Movie and TV show data is provided by The Movie Database (TMDB) API. ShowSeek is not
            affiliated with TMDB, and all content information is sourced from their database.
          </p>
        </Section>

        <Section title="3. User Accounts">
          <h3 className="text-white font-semibold text-lg mt-5 mb-2">3.1 Account Creation</h3>
          <p>
            To access certain features of the App, you may need to create an account. You can sign
            up using your email address or continue as a guest with limited functionality.
          </p>

          <h3 className="text-white font-semibold text-lg mt-5 mb-2">3.2 Account Security</h3>
          <p>You are responsible for:</p>
          <ul className="list-disc ml-6 mb-4 text-gray-300 space-y-2">
            <li>Maintaining the confidentiality of your account credentials</li>
            <li>All activities that occur under your account</li>
            <li>Notifying us immediately of any unauthorized use of your account</li>
          </ul>

          <h3 className="text-white font-semibold text-lg mt-5 mb-2">3.3 Guest Access</h3>
          <p>
            Guest users may browse content but will have limited access to features such as ratings,
            watchlists, and personalized lists. To unlock full functionality, you must create an
            account.
          </p>
        </Section>

        <Section title="4. User Conduct">
          <p>When using ShowSeek, you agree NOT to:</p>
          <ul className="list-disc ml-6 mb-4 text-gray-300 space-y-2">
            <li>Use the App for any illegal or unauthorized purpose</li>
            <li>
              Attempt to gain unauthorized access to the App&apos;s systems or other users&apos;
              accounts
            </li>
            <li>Interfere with or disrupt the App&apos;s servers or networks</li>
            <li>Reverse engineer, decompile, or disassemble any part of the App</li>
            <li>Use automated systems or bots to access the App</li>
            <li>Violate any applicable laws or regulations</li>
            <li>Infringe upon the intellectual property rights of others</li>
          </ul>
        </Section>

        <Section title="5. Content and Intellectual Property">
          <h3 className="text-white font-semibold text-lg mt-5 mb-2">5.1 Third-Party Content</h3>
          <p>
            The App displays movie and TV show information, images, trailers, and other content
            sourced from The Movie Database (TMDB). This content is the property of their respective
            owners and is used in accordance with TMDB&apos;s terms of use.
          </p>

          <h3 className="text-white font-semibold text-lg mt-5 mb-2">5.2 App Content</h3>
          <p>
            The ShowSeek App, including its design, code, features, and branding, is our
            intellectual property and is protected by copyright and other intellectual property
            laws.
          </p>

          <h3 className="text-white font-semibold text-lg mt-5 mb-2">5.3 User-Generated Content</h3>
          <p>
            Any ratings, lists, or other content you create within the App remains your property.
            However, by using the App, you grant us a non-exclusive license to store and display
            this content as necessary to provide the service.
          </p>
        </Section>

        <Section title="6. Privacy and Data">
          <p>
            Your privacy is important to us. Our collection and use of personal data is governed by
            our{' '}
            <a href="/show-seek/privacy" className="text-[#E50914] hover:underline">
              Privacy Policy
            </a>
            . By using the App, you consent to:
          </p>
          <ul className="list-disc ml-6 mb-4 text-gray-300 space-y-2">
            <li>The collection and storage of your account information</li>
            <li>The storage of your watchlists, favorites, ratings, and episode tracking data</li>
            <li>The use of Firebase for authentication and data storage</li>
            <li>The receipt of push notifications (if enabled) for movie release reminders</li>
          </ul>
        </Section>

        <Section title="7. Notifications">
          <p>
            ShowSeek may send push notifications to remind you about upcoming movie releases and
            other relevant updates. You can manage notification preferences through your device
            settings at any time.
          </p>
        </Section>

        <Section title="8. Disclaimers">
          <h3 className="text-white font-semibold text-lg mt-5 mb-2">
            8.1 &quot;As Is&quot; Service
          </h3>
          <p>
            The App is provided &quot;as is&quot; and &quot;as available&quot; without warranties of
            any kind, either express or implied, including but not limited to:
          </p>
          <ul className="list-disc ml-6 mb-4 text-gray-300 space-y-2">
            <li>Implied warranties of merchantability</li>
            <li>Fitness for a particular purpose</li>
            <li>Non-infringement</li>
          </ul>

          <h3 className="text-white font-semibold text-lg mt-5 mb-2">8.2 Content Accuracy</h3>
          <p>
            We do not guarantee the accuracy, completeness, or timeliness of movie and TV show
            information displayed in the App. This information is sourced from third parties and may
            contain errors or become outdated.
          </p>

          <h3 className="text-white font-semibold text-lg mt-5 mb-2">8.3 Service Availability</h3>
          <p>
            We do not guarantee uninterrupted or error-free operation of the App. Service may be
            temporarily unavailable due to maintenance, updates, or technical issues.
          </p>
        </Section>

        <Section title="9. Limitation of Liability">
          <p>
            To the maximum extent permitted by law, ShowSeek and its affiliates, officers,
            employees, and agents shall not be liable for:
          </p>
          <ul className="list-disc ml-6 mb-4 text-gray-300 space-y-2">
            <li>Any indirect, incidental, special, consequential, or punitive damages</li>
            <li>Any loss of profits, data, or goodwill</li>
            <li>Any damages arising from your use or inability to use the App</li>
            <li>Any content or conduct of third parties on or through the App</li>
          </ul>
        </Section>

        <Section title="10. Indemnification">
          <p>
            You agree to indemnify, defend, and hold harmless ShowSeek and its affiliates from any
            claims, damages, losses, or expenses (including legal fees) arising from:
          </p>
          <ul className="list-disc ml-6 mb-4 text-gray-300 space-y-2">
            <li>Your use of the App</li>
            <li>Your violation of these Terms</li>
            <li>Your violation of any rights of another party</li>
          </ul>
        </Section>

        <Section title="11. Termination">
          <p>
            We reserve the right to suspend or terminate your access to the App at any time, without
            notice, for any reason, including violation of these Terms. You may also delete your
            account at any time through the App settings.
          </p>
          <p>
            Upon termination, your right to use the App will immediately cease, and your stored data
            may be deleted in accordance with our Privacy Policy.
          </p>
        </Section>

        <Section title="12. Changes to Terms">
          <p>
            We may update these Terms from time to time. When we do, we will revise the &quot;Last
            Updated&quot; date at the top of this page. Continued use of the App after changes
            constitutes acceptance of the modified Terms.
          </p>
        </Section>

        <Section title="13. Governing Law">
          <p>
            These Terms shall be governed by and construed in accordance with applicable laws,
            without regard to conflict of law principles. Any disputes arising from these Terms or
            your use of the App shall be resolved in the appropriate courts.
          </p>
        </Section>

        <Section title="14. Severability">
          <p>
            If any provision of these Terms is found to be invalid or unenforceable, the remaining
            provisions will continue in full force and effect.
          </p>
        </Section>

        <Section title="15. Entire Agreement">
          <p>
            These Terms, together with our Privacy Policy, constitute the entire agreement between
            you and ShowSeek regarding your use of the App and supersede any prior agreements.
          </p>
        </Section>

        <div className="bg-neutral-900 rounded-xl p-6 mt-8 text-center">
          <h2 className="text-[#E50914] text-xl font-bold mb-4">Contact Us</h2>
          <p className="text-gray-300 mb-2">
            If you have any questions about these Terms of Service, please contact us:
          </p>
          <p className="text-white">
            <strong>Email:</strong> support@showseek.app
          </p>
        </div>

        <footer className="mt-12 pt-5 border-t border-neutral-800 text-center text-gray-500 text-sm">
          <p>&copy; 2025 ShowSeek. All rights reserved.</p>
          <p className="mt-1">
            Movie and TV data provided by{' '}
            <a
              href="https://www.themoviedb.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#E50914] hover:underline"
            >
              TMDB
            </a>
            .
          </p>
        </footer>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-[#E50914] text-xl font-bold mt-8 mb-4 pb-2 border-b border-neutral-800">
        {title}
      </h2>
      <div className="text-gray-300 space-y-4">{children}</div>
    </section>
  );
}
