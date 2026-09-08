import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Camera, Check, FileText, IdCard, Loader2, UserRound } from 'lucide-react';
import { Button } from '@/design-system/primitives/Button';
import { SelectField, TextField } from '@/design-system/primitives/Field';
import { AuthHeading } from './AuthShared';
import { useSeo } from '@/lib/seo';
import { cn } from '@/lib/cn';

const STEPS = [
  { id: 0, label: 'Your details', icon: UserRound },
  { id: 1, label: 'Identity document', icon: IdCard },
  { id: 2, label: 'Liveness check', icon: Camera },
  { id: 3, label: 'Review', icon: FileText },
];

export default function VerifyIdentityPage() {
  useSeo({
    title: 'Verify your identity',
    description: 'Complete identity verification to unlock trading, deposits and withdrawals.',
    noindex: true,
  });

  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  const next = () => (step < STEPS.length - 1 ? setStep(step + 1) : navigate('/'));

  return (
    <div>
      <AuthHeading
        title="Verify your identity"
        body="Regulation requires it and it takes about two minutes. Ninety-four percent of applications clear automatically."
      />

      <ol className="mb-9 flex items-center gap-2" aria-label="Verification progress">
        {STEPS.map((s, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <li key={s.id} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-full border transition-all duration-500',
                  done && 'border-up bg-up/15 text-up',
                  active && 'border-brand-soft bg-brand/15 text-brand-soft',
                  !done && !active && 'border-line text-fg-subtle',
                )}
                aria-current={active ? 'step' : undefined}
              >
                {done ? <Check className="size-4" /> : <s.icon className="size-4" />}
              </span>
              {i < STEPS.length - 1 ? (
                <span
                  aria-hidden
                  className={cn('h-px flex-1 transition-colors duration-500', done ? 'bg-up' : 'bg-line')}
                />
              ) : null}
            </li>
          );
        })}
      </ol>

      <p className="mb-6 font-mono text-2xs uppercase tracking-[0.18em] text-fg-subtle">
        Step {step + 1} of {STEPS.length} · {STEPS[step].label}
      </p>

      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
      >
        {step === 0 ? (
          <>
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField label="Legal first name" name="first" required placeholder="Ada" />
              <TextField label="Legal last name" name="last" required placeholder="Lovelace" />
            </div>
            <TextField label="Date of birth" name="dob" type="date" required />
            <TextField label="Residential address" name="address" required placeholder="17 Kingsway Road, Ikoyi" />
          </>
        ) : null}

        {step === 1 ? (
          <>
            <SelectField
              label="Document type"
              name="doc"
              options={[
                { value: 'passport', label: 'Passport' },
                { value: 'id', label: 'National ID card' },
                { value: 'licence', label: "Driver's licence" },
              ]}
            />
            <div className="grid place-items-center rounded-lg border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
              <IdCard className="size-8 text-fg-subtle" />
              <p className="mt-4 text-sm font-medium text-fg">Upload or photograph your document</p>
              <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-fg-subtle">
                All four corners visible, no glare, and the machine-readable zone unobstructed.
              </p>
              <Button type="button" variant="outline" size="sm" className="mt-5">
                Choose file
              </Button>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <div className="grid place-items-center rounded-lg border border-line bg-surface px-6 py-14 text-center">
            <span className="relative grid size-24 place-items-center rounded-full border border-brand-soft/50">
              <span
                aria-hidden
                className="absolute inset-0 animate-[pulse-ring_2.6s_var(--ease-out-expo)_infinite] rounded-full border border-brand-soft"
              />
              <Camera className="size-9 text-brand-soft" />
            </span>
            <p className="mt-6 text-sm font-medium text-fg">Centre your face in the frame</p>
            <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-fg-subtle">
              Look straight ahead, then follow the on-screen prompt. This confirms a real person is
              present and takes about eight seconds.
            </p>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="rounded-lg border border-line bg-surface p-6">
            <div className="flex items-center gap-3">
              <Loader2 className="size-5 animate-spin text-brand-soft" />
              <p className="text-sm font-medium text-fg">Reviewing your submission</p>
            </div>
            <dl className="mt-6 space-y-3 text-sm">
              {[
                ['Details', 'Received'],
                ['Document', 'Received'],
                ['Liveness', 'Received'],
                ['Sanctions screening', 'In progress'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <dt className="text-fg-subtle">{k}</dt>
                  <dd className={v === 'In progress' ? 'text-warn' : 'text-up'}>{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-6 border-t border-line pt-5 text-xs leading-relaxed text-fg-subtle">
              Most checks complete within two minutes. We will email you either way, and you can
              close this page.
            </p>
          </div>
        ) : null}

        <div className="flex gap-3">
          {step > 0 ? (
            <Button type="button" variant="outline" size="lg" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          ) : null}
          <Button type="submit" size="lg" sheen className="flex-1">
            {step === STEPS.length - 1 ? 'Finish' : 'Continue'}
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Button>
        </div>
      </form>

      <p className="mt-8 text-center text-xs leading-relaxed text-fg-subtle">
        Documents are encrypted at rest, processed by our own systems, and deleted 90 days after a
        decision unless we are required to retain them.
      </p>
    </div>
  );
}
