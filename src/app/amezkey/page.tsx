'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Eye, EyeOff, Lock, User, AlertCircle, ArrowRight } from 'lucide-react';

export default function AdminLogin() {
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [shake, setShake] = useState(false);
    const userRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setMounted(true);
        // Check if already authenticated
        const auth = sessionStorage.getItem('amez_admin_auth');
        if (auth === 'true') {
            router.replace('/admin');
        }
        setTimeout(() => userRef.current?.focus(), 400);
    }, [router]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        // Simulate auth delay for realism
        await new Promise(r => setTimeout(r, 900));

        if (username.trim() === 'amezamanj' && password === 'amez@harbin') {
            sessionStorage.setItem('amez_admin_auth', 'true');
            router.push('/admin');
        } else {
            setError('Invalid credentials. Access denied.');
            setIsLoading(false);
            setShake(true);
            setTimeout(() => setShake(false), 600);
        }
    };

    return (
        <div className="login-root">
            {/* Animated background grid */}
            <div className="login-grid-bg" />

            {/* Floating orbs */}
            <div className="orb orb-1" />
            <div className="orb orb-2" />
            <div className="orb orb-3" />

            <div className={`login-card ${mounted ? 'login-card--visible' : ''} ${shake ? 'login-card--shake' : ''}`}>
                {/* Header */}
                <div className="login-header">
                    <div className="login-icon-wrap">
                        <ShieldCheck size={28} strokeWidth={1.5} />
                    </div>
                    <div>
                        <h1 className="login-title">Administration Access</h1>
                        <p className="login-subtitle">Harbin Institute of Technology · AcousticKeys</p>
                    </div>
                </div>

                {/* Security badge */}
                <div className="login-badge">
                    <div className="badge-dot" />
                    <span>Secure Authentication Required</span>
                </div>

                {/* Form */}
                <form onSubmit={handleLogin} className="login-form" autoComplete="off">
                    <div className="field-group">
                        <label htmlFor="username" className="field-label">
                            <User size={13} />
                            Username
                        </label>
                        <div className="field-input-wrap">
                            <input
                                ref={userRef}
                                id="username"
                                type="text"
                                value={username}
                                onChange={e => { setUsername(e.target.value); setError(''); }}
                                placeholder="Enter username"
                                className={`field-input ${error ? 'field-input--error' : ''}`}
                                disabled={isLoading}
                                autoComplete="off"
                                spellCheck={false}
                            />
                        </div>
                    </div>

                    <div className="field-group">
                        <label htmlFor="password" className="field-label">
                            <Lock size={13} />
                            Password
                        </label>
                        <div className="field-input-wrap">
                            <input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={e => { setPassword(e.target.value); setError(''); }}
                                placeholder="Enter password"
                                className={`field-input ${error ? 'field-input--error' : ''}`}
                                disabled={isLoading}
                                autoComplete="new-password"
                            />
                            <button
                                type="button"
                                className="pw-toggle"
                                onClick={() => setShowPassword(v => !v)}
                                tabIndex={-1}
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className="error-banner" role="alert">
                            <AlertCircle size={15} />
                            <span>{error}</span>
                        </div>
                    )}

                    <button
                        id="login-submit-btn"
                        type="submit"
                        className="login-btn"
                        disabled={isLoading || !username || !password}
                    >
                        {isLoading ? (
                            <span className="login-spinner" />
                        ) : (
                            <>
                                <span>Authenticate</span>
                                <ArrowRight size={18} />
                            </>
                        )}
                    </button>
                </form>

                <p className="login-footer">
                    Restricted access — authorized personnel only
                </p>
            </div>

            <style>{`
        .login-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #050508;
          position: relative;
          overflow: hidden;
          font-family: 'Inter', system-ui, sans-serif;
        }

        .login-grid-bg {
          position: fixed;
          inset: 0;
          background-image:
            linear-gradient(rgba(0,242,255,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,242,255,0.04) 1px, transparent 1px);
          background-size: 60px 60px;
          animation: gridPan 20s linear infinite;
          pointer-events: none;
        }

        @keyframes gridPan {
          from { background-position: 0 0; }
          to { background-position: 60px 60px; }
        }

        .orb {
          position: fixed;
          border-radius: 50%;
          filter: blur(80px);
          pointer-events: none;
          animation: orbFloat 8s ease-in-out infinite;
        }
        .orb-1 {
          width: 500px; height: 500px;
          background: radial-gradient(circle, rgba(0,242,255,0.12) 0%, transparent 70%);
          top: -150px; left: -100px;
          animation-delay: 0s;
        }
        .orb-2 {
          width: 400px; height: 400px;
          background: radial-gradient(circle, rgba(112,0,255,0.15) 0%, transparent 70%);
          bottom: -100px; right: -80px;
          animation-delay: -3s;
        }
        .orb-3 {
          width: 300px; height: 300px;
          background: radial-gradient(circle, rgba(255,0,200,0.08) 0%, transparent 70%);
          top: 40%; left: 60%;
          animation-delay: -5s;
        }

        @keyframes orbFloat {
          0%, 100% { transform: translate(0,0) scale(1); }
          33% { transform: translate(20px,-30px) scale(1.05); }
          66% { transform: translate(-15px,15px) scale(0.95); }
        }

        .login-card {
          position: relative;
          width: 100%;
          max-width: 440px;
          margin: 1.5rem;
          background: rgba(10,10,20,0.85);
          backdrop-filter: blur(30px);
          -webkit-backdrop-filter: blur(30px);
          border: 1px solid rgba(0,242,255,0.15);
          border-radius: 28px;
          padding: 2.5rem;
          box-shadow:
            0 0 0 1px rgba(0,242,255,0.05),
            0 20px 60px rgba(0,0,0,0.6),
            0 0 80px rgba(0,242,255,0.06);
          opacity: 0;
          transform: translateY(24px) scale(0.97);
          transition: opacity 0.5s ease, transform 0.5s ease;
        }

        .login-card--visible {
          opacity: 1;
          transform: translateY(0) scale(1);
        }

        .login-card--shake {
          animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
        }

        @keyframes shake {
          10%, 90% { transform: translateX(-3px); }
          20%, 80% { transform: translateX(5px); }
          30%, 50%, 70% { transform: translateX(-6px); }
          40%, 60% { transform: translateX(6px); }
        }

        .login-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1.5rem;
          padding-bottom: 1.5rem;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }

        .login-icon-wrap {
          width: 56px;
          height: 56px;
          border-radius: 16px;
          background: linear-gradient(135deg, rgba(0,242,255,0.15), rgba(112,0,255,0.15));
          border: 1px solid rgba(0,242,255,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #00f2ff;
          flex-shrink: 0;
          box-shadow: 0 0 20px rgba(0,242,255,0.1);
        }

        .login-title {
          font-size: 1.15rem;
          font-weight: 700;
          color: #eee;
          margin: 0 0 0.2rem 0;
          letter-spacing: -0.01em;
          background: none;
          -webkit-text-fill-color: #eee;
          background-clip: unset;
        }

        .login-subtitle {
          font-size: 0.72rem;
          color: #555;
          margin: 0;
        }

        .login-badge {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.72rem;
          color: #00f2ff;
          background: rgba(0,242,255,0.06);
          border: 1px solid rgba(0,242,255,0.12);
          border-radius: 8px;
          padding: 0.5rem 0.8rem;
          margin-bottom: 1.8rem;
          opacity: 0.85;
        }

        .badge-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #00f2ff;
          animation: badgePulse 2s ease-in-out infinite;
          flex-shrink: 0;
        }

        @keyframes badgePulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 4px #00f2ff; }
          50% { opacity: 0.5; box-shadow: 0 0 8px #00f2ff; }
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 1.2rem;
        }

        .field-group {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .field-label {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.72rem;
          font-weight: 600;
          color: #777;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .field-input-wrap {
          position: relative;
        }

        .field-input {
          width: 100%;
          padding: 0.85rem 1rem;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          color: #eee;
          font-size: 0.95rem;
          font-family: inherit;
          outline: none;
          transition: all 0.2s ease;
        }

        .field-input:focus {
          border-color: rgba(0,242,255,0.4);
          background: rgba(0,242,255,0.04);
          box-shadow: 0 0 0 3px rgba(0,242,255,0.08), 0 0 15px rgba(0,242,255,0.06);
        }

        .field-input--error {
          border-color: rgba(255,51,102,0.5) !important;
          box-shadow: 0 0 0 3px rgba(255,51,102,0.1) !important;
        }

        .field-input::placeholder {
          color: #444;
        }

        .field-input:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .pw-toggle {
          position: absolute;
          right: 0.8rem;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: #555;
          cursor: pointer;
          padding: 0.2rem;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.2s;
        }

        .pw-toggle:hover { color: #00f2ff; }

        .error-banner {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.7rem 0.9rem;
          background: rgba(255,51,102,0.08);
          border: 1px solid rgba(255,51,102,0.25);
          border-radius: 10px;
          color: #ff3366;
          font-size: 0.8rem;
          font-weight: 500;
        }

        .login-btn {
          margin-top: 0.4rem;
          padding: 0.95rem 1.5rem;
          background: linear-gradient(135deg, #00c8ff, #7000ff);
          border: none;
          border-radius: 14px;
          color: #fff;
          font-size: 1rem;
          font-weight: 700;
          font-family: inherit;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.6rem;
          transition: all 0.25s ease;
          box-shadow: 0 4px 20px rgba(0,200,255,0.2);
          letter-spacing: 0.01em;
        }

        .login-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 30px rgba(0,200,255,0.35);
          filter: brightness(1.1);
        }

        .login-btn:active:not(:disabled) {
          transform: translateY(0);
        }

        .login-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        .login-spinner {
          width: 20px;
          height: 20px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .login-footer {
          margin-top: 1.5rem;
          text-align: center;
          font-size: 0.68rem;
          color: #333;
          letter-spacing: 0.03em;
        }
      `}</style>
        </div>
    );
}
