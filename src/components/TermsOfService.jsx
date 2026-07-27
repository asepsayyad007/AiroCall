import React from 'react';
import { FileText, AlertTriangle, Users, Ban } from 'lucide-react';

export default function TermsOfService() {
  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '40px 20px' }}>
      <div className="glass-panel" style={{ padding: '40px 32px' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
          <FileText size={28} color="var(--brand-primary)" />
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700 }}>Terms of Service</h1>
        </div>

        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.85rem' }}>
          Last updated: July 2026
        </p>

        <section style={{ marginBottom: '28px' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '10px' }}>1. Service Description</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: '1.6' }}>
            AiroCall provides instant peer-to-peer video calling with optional Smart TV streaming. The service uses WebRTC technology for real-time communication. No account creation is required.
          </p>
        </section>

        <section style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <Users size={18} color="var(--brand-primary)" />
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>2. Eligibility</h2>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: '1.6' }}>
            You must be at least 13 years of age to use AiroCall. By using this service, you confirm you meet this age requirement. Users under 18 should use the service under parental guidance.
          </p>
        </section>

        <section style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <Ban size={18} color="var(--color-danger)" />
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>3. Prohibited Use</h2>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: '1.6', marginBottom: '12px' }}>
            You agree NOT to use AiroCall for:
          </p>
          <ul style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: '1.8', paddingLeft: '20px' }}>
            <li>Any illegal activity or content</li>
            <li>Harassment, bullying, or threats</li>
            <li>Distribution of harmful, obscene, or exploitative content</li>
            <li>Recording calls without consent of all participants</li>
            <li>Attempting to hack, overload, or disrupt the service</li>
            <li>Impersonation of others</li>
            <li>Automated or bot-driven usage</li>
          </ul>
        </section>

        <section style={{ marginBottom: '28px' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '10px' }}>4. No Warranty</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: '1.6' }}>
            AiroCall is provided "as is" without warranties of any kind. We do not guarantee uninterrupted service, call quality, or availability. WebRTC connections depend on network conditions, device capabilities, and browser support.
          </p>
        </section>

        <section style={{ marginBottom: '28px' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '10px' }}>5. Limitation of Liability</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: '1.6' }}>
            AiroCall and its operators shall not be liable for any direct, indirect, incidental, or consequential damages arising from use of the service. Since all communications are peer-to-peer encrypted, we cannot monitor, control, or be held responsible for content shared between users.
          </p>
        </section>

        <section style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <AlertTriangle size={18} color="var(--color-warning)" />
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>6. Content Responsibility</h2>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: '1.6' }}>
            Users are solely responsible for content they share during calls. AiroCall does not and cannot monitor call content due to end-to-end encryption. Report abuse to: <strong style={{ color: 'var(--text-primary)' }}>abuse@airocall.app</strong>
          </p>
        </section>

        <section style={{ marginBottom: '28px' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '10px' }}>7. Termination</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: '1.6' }}>
            We reserve the right to block access to the service for any user who violates these terms, including IP-based blocking for abuse prevention.
          </p>
        </section>

        <section style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '10px' }}>8. Governing Law</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: '1.6' }}>
            These terms are governed by the laws of India, including the Information Technology Act, 2000 and its amendments. Disputes shall be subject to the jurisdiction of courts in India.
          </p>
        </section>

      </div>
    </div>
  );
}
