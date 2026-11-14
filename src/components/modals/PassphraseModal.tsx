import React, { useEffect, useState } from 'react';
import { Lock, LockOpen, Loader2 } from 'lucide-react';
import { Dialog } from '@/components/common/Dialog';

export const MIN_PASSPHRASE = 10;

interface Props {
  isOpen: boolean;
  mode: 'lock' | 'unlock';
  caseName: string;
  onClose: () => void;
  /** Resolves with an error message to show, or null on success (the dialog then closes). */
  onSubmit: (passphrase: string) => Promise<string | null>;
}

export const PassphraseModal: React.FC<Props> = ({ isOpen, mode, caseName, onClose, onSubmit }) => {
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const locking = mode === 'lock';

  useEffect(() => {
    if (isOpen) {
      setPass('');
      setConfirm('');
      setUnderstood(false);
      setError(null);
      setBusy(false);
    }
  }, [isOpen, mode]);

  const tooShort = locking && pass.length > 0 && pass.length < MIN_PASSPHRASE;
  const mismatch = locking && confirm.length > 0 && pass !== confirm;
  const canSubmit = !busy && pass.length >= (locking ? MIN_PASSPHRASE : 1) && (!locking || (pass === confirm && understood));

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const err = await onSubmit(pass);
    setBusy(false);
    if (err) setError(err);
    else onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={busy ? () => {} : onClose}
      title={locking ? 'Lock and encrypt this case' : 'Unlock case'}
      subtitle={caseName}
      width={480}
      footer={
        <>
          <button type="button" className="t-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="passphrase-form" className="t-btn t-btn-primary" disabled={!canSubmit}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : locking ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
            {locking ? 'Encrypt and lock' : 'Unlock'}
          </button>
        </>
      }
    >
      <form id="passphrase-form" onSubmit={submit} className="p-3 space-y-3">
        {locking ? (
          <div className="text-[11.5px] text-zinc-400 leading-relaxed space-y-1.5">
            <p>The case is packed into one encrypted file and the plain folder is removed, together with its saved versions and backups (they hold plain copies).</p>
            <p className="text-amber-400">There is no way to recover a lost passphrase. Nobody, including the TRACE authors, can open the case without it.</p>
            <p>While the case is unlocked it is an ordinary folder again; lock it again when you finish. The case name stays visible in the file name.</p>
          </div>
        ) : (
          <p className="text-[11.5px] text-zinc-400">Enter the passphrase. The case is decrypted back into your workspace and the encrypted file is removed until you lock it again.</p>
        )}
        <div>
          <label htmlFor="pp-1" className="block text-[11px] text-zinc-500 mb-1">
            Passphrase
          </label>
          <input id="pp-1" type="password" autoFocus autoComplete="off" className="t-input" value={pass} onChange={(e) => setPass(e.target.value)} />
          {tooShort && <div className="text-[11px] text-amber-400 mt-1">Use at least {MIN_PASSPHRASE} characters. A few random words work well.</div>}
        </div>
        {locking && (
          <>
            <div>
              <label htmlFor="pp-2" className="block text-[11px] text-zinc-500 mb-1">
                Repeat passphrase
              </label>
              <input id="pp-2" type="password" autoComplete="off" className="t-input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              {mismatch && <div className="text-[11px] text-rose-400 mt-1">The two passphrases are different.</div>}
            </div>
            <label className="flex items-start gap-2 text-[11.5px] text-zinc-300 cursor-pointer">
              <input type="checkbox" className="accent-[var(--t-accent)] mt-0.5" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
              <span>I understand that if I lose this passphrase the case cannot be recovered.</span>
            </label>
          </>
        )}
        {error && (
          <div role="alert" className="text-[11.5px] text-rose-400">
            {error}
          </div>
        )}
      </form>
    </Dialog>
  );
};
